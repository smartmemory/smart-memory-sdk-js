// Visible Suspense fallback (WEB-STALE-TAB-VERSION-CHECK-1). `<Suspense fallback={null}>` turns a hung lazy
// import into a silent blank page. Use `<Suspense fallback={<LazyFallback />}>` instead: empty for the first
// ~1 s (no flash on a normal load), then a quiet spinner, then after ~10 s a "Still loading" Reload button.
import React, { useEffect, useState } from 'react';

export const LAZY_FALLBACK_SPINNER_MS = 1000;
export const LAZY_FALLBACK_RELOAD_MS = 10000;

const boxStyle = {
  minHeight: '40vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 12, padding: 24, fontFamily: 'inherit', color: 'inherit',
};
const spinnerStyle = {
  width: 24, height: 24, borderRadius: '50%', border: '3px solid rgba(127,127,127,0.25)',
  borderTopColor: 'rgba(127,127,127,0.8)', animation: 'sm-lazy-spin 0.8s linear infinite',
};
const buttonStyle = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(127,127,127,0.5)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit',
};

export function LazyFallback() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), LAZY_FALLBACK_SPINNER_MS);
    const t2 = setTimeout(() => setPhase(2), LAZY_FALLBACK_RELOAD_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (phase === 0) return null;
  return (
    <div className="sm-recovery sm-lazy-fallback" role="status" style={boxStyle}>
      <style>{'@keyframes sm-lazy-spin { to { transform: rotate(360deg); } }'}</style>
      <div style={spinnerStyle} aria-label="Loading" />
      {phase === 2 && (
        <>
          <span style={{ opacity: 0.75 }}>Still loading.</span>
          <button type="button" style={buttonStyle} onClick={() => window.location.reload()}>Reload</button>
        </>
      )}
    </div>
  );
}
