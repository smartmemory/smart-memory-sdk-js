// Top-level safety net for every SmartMemory UI (WEB-BLANK-AFTER-IDLE-1). Without it an uncaught render error
// unmounts the whole React root and the tab turns white. Wrap the app once:
//   <RecoveryBoundary app="studio"><App /></RecoveryBoundary>
// - stale chunk after a deploy: reload once (route kept: location.reload keeps the URL), render nothing meanwhile;
//   a second one inside the guard window shows "A new version is available" with a Reload button.
// - auth error thrown during render: reload once through the same guard (a fresh load re-runs the session
//   bootstrap, which refreshes the token or sends the user to sign in); never a white page.
// - any other render error: a "Something went wrong" card with Reload, logged with its component stack.
import React from 'react';
import {
  CHUNK_RELOAD_INFLIGHT_MS,
  isChunkReloadInFlight,
  reloadOnceForChunkError,
} from './chunkReload.js';
import { classifyError } from './classify.js';
import { installRecovery, logRecovery, NEW_VERSION_EVENT } from './install.js';

const boxStyle = {
  minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  fontFamily: 'inherit', color: 'inherit',
};
const cardStyle = {
  maxWidth: 420, width: '100%', textAlign: 'center', padding: 24, borderRadius: 8,
  border: '1px solid rgba(127,127,127,0.35)',
};
const buttonStyle = {
  marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(127,127,127,0.5)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit',
};
const bannerStyle = {
  position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 2147483000,
  padding: '10px 16px', borderRadius: 8, background: '#111827', color: '#f9fafb',
  boxShadow: '0 4px 16px rgba(0,0,0,0.25)', display: 'flex', gap: 12, alignItems: 'center', font: 'inherit',
};

function reloadPage() {
  window.location.reload();
}

/** "A new version is available" card: shown only when the automatic reload already ran inside the guard window. */
export function NewVersionNotice() {
  return (
    <div className="sm-recovery sm-recovery-new-version" role="alert" style={boxStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 20 }}>A new version of SmartMemory is available.</h2>
        <p style={{ margin: '8px 0 0', opacity: 0.75 }}>Reload to get the latest version.</p>
        <button type="button" style={buttonStyle} onClick={reloadPage}>Reload</button>
      </div>
    </div>
  );
}

/** Generic fallback for a render error that is not a stale chunk. */
export function CrashNotice() {
  return (
    <div className="sm-recovery sm-recovery-crash" role="alert" style={boxStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong on this page.</h2>
        <p style={{ margin: '8px 0 0', opacity: 0.75 }}>Reload to try again. The error was reported.</p>
        <button type="button" style={buttonStyle} onClick={reloadPage}>Reload</button>
      </div>
    </div>
  );
}

export class RecoveryBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, kind: null, reloading: false, reloadInFlight: false, newVersion: false };
    this.onNewVersion = () => this.setState({ newVersion: true });
    installRecovery({ app: props.app, onAuthFailure: props.onAuthFailure });
  }

  static getDerivedStateFromError(error) {
    // Read at throw time: preventDefault on vite:preloadError makes the lazy import resolve undefined, so React
    // throws a follow-on TypeError while the reload is already on its way. That one must stay quiet.
    return { error, kind: classifyError(error), reloadInFlight: isChunkReloadInFlight() };
  }

  componentDidMount() {
    window.addEventListener(NEW_VERSION_EVENT, this.onNewVersion);
  }

  componentWillUnmount() {
    window.removeEventListener(NEW_VERSION_EVENT, this.onNewVersion);
    clearTimeout(this.inFlightTimer);
  }

  componentDidCatch(error, info) {
    const app = this.props.app || 'app';
    const { kind } = this.state;
    if (this.state.reloadInFlight && kind !== 'chunk') {
      logRecovery(app, 'chunk-reload-echo', error);
      this.inFlightTimer = setTimeout(() => this.setState({ reloadInFlight: false }), CHUNK_RELOAD_INFLIGHT_MS);
      return;
    }
    if (kind === 'chunk' || kind === 'auth') {
      // One guarded reload for both: a stale build gets the new index, an expired session re-bootstraps.
      const reloading = reloadOnceForChunkError(`${app} RecoveryBoundary ${kind}`, error);
      if (kind === 'auth') logRecovery(app, 'auth-render', error);
      this.setState({ reloading });
      return;
    }
    if (info && info.componentStack) console.warn(`[recovery] ${app}: component stack:${info.componentStack}`);
    logRecovery(app, 'render', error);
    if (typeof this.props.onError === 'function') this.props.onError(error, info);
  }

  render() {
    const { error, kind, reloading, reloadInFlight, newVersion } = this.state;
    if (error) {
      if (reloadInFlight && kind !== 'chunk') return null;
      if (kind === 'chunk') return reloading ? null : <NewVersionNotice />;
      if (kind === 'auth' && reloading) return null;
      if (this.props.fallback !== undefined) return this.props.fallback;
      return <CrashNotice />;
    }
    return (
      <>
        {this.props.children}
        {newVersion ? (
          <div className="sm-recovery sm-recovery-banner" role="status" style={bannerStyle}>
            <span>A new version of SmartMemory is available.</span>
            <button type="button" style={{ ...buttonStyle, marginTop: 0, borderColor: '#9ca3af' }} onClick={reloadPage}>
              Reload
            </button>
          </div>
        ) : null}
      </>
    );
  }
}
