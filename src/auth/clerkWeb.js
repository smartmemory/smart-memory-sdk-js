export const CLERK_APPEARANCE = {
  variables: {
    colorBackground: 'transparent',
    colorPrimary: '#2563eb',
    colorText: '#ffffff',
    colorTextSecondary: '#cbd5e1',
    colorInputBackground: '#0f172a',
    colorInputText: '#ffffff',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'w-full px-2 overflow-visible',
    cardBox: 'w-full overflow-visible',
    card: 'w-full bg-transparent shadow-none border-0 p-0 overflow-visible',
    header: 'hidden',
    socialButtonsBlockButton: '!bg-white text-slate-900 hover:!bg-slate-100 border border-slate-300',
    socialButtonsBlockButtonText: 'text-slate-900 font-semibold',
    socialButtonsIconButton: '!bg-white text-slate-900 hover:!bg-slate-100 border border-slate-300',
    dividerLine: 'bg-slate-600',
    dividerText: 'text-slate-300',
    formFieldRow: 'px-1 overflow-visible',
    formFieldLabel: 'text-slate-100 pl-1',
    formFieldInput: '!bg-slate-100 border-slate-300 !text-slate-950 placeholder:text-slate-500',
    otpCodeFieldInput: '!bg-white border-slate-300 !text-slate-950',
    formFieldSuccessText: 'text-emerald-300',
    formFieldErrorText: 'text-red-300',
    formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 text-white',
    footerActionLink: 'text-blue-400 hover:text-blue-300',
    // Clerk paints the footer with TWO stacked background-image layers, the
    // second an opaque black linear-gradient — !bg-transparent only overrides
    // background-COLOR, so !bg-none is required to kill the background-IMAGE
    // and let the card show through. Verified against live DOM 2026-05-28.
    footer: '!bg-transparent !bg-none',
    footerAction: '!bg-transparent',
    badge: 'hidden',
    // The "Last used" pill is cl-lastAuthenticationStrategyBadge, NOT cl-badge —
    // the badge:'hidden' above never caught it. It also clips past the card edge.
    lastAuthenticationStrategyBadge: 'hidden',
  },
};

export async function getClerkTokenWithRetry(getToken, attempts = 8, delayMs = 300) {
  for (let i = 0; i < attempts; i += 1) {
    let token = null;
    try {
      token = await getToken({ skipCache: true });
    } catch {
      token = await getToken();
    }
    if (token) return token;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

export async function exchangeClerkSession({
  apiBaseUrl,
  getToken,
}) {
  const clerkToken = await getClerkTokenWithRetry(getToken);
  if (!clerkToken) {
    throw new Error('Missing Clerk token after retries');
  }
  const resp = await fetch(`${apiBaseUrl}/auth/clerk/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clerkToken}` },
    credentials: 'include',
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `Session bootstrap failed (${resp.status})`);
  }
  return {
    response: resp,
    accessToken: resp.headers.get('x-sm-access-token'),
    teamId: resp.headers.get('x-sm-workspace-id'),
  };
}

