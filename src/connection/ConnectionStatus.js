/** One observable per AuthCore/client; unrelated successes cannot hide failures. */
export class ConnectionStatus {
  #listeners = new Set();
  #issues = new Map();
  #signedOut = false;
  #signOutReason = null;
  get snapshot() {
    return Object.freeze({
      status: this.#signedOut ? 'signed_out' : this.#issues.size ? 'reconnecting' : 'connected',
      reason: this.#signedOut ? 'Authentication required' : [...this.#issues.values()].at(-1) || null,
      // Present only while signed_out. Why we are signed out: 'user' (logout, account switch) or 'expired' (401, refresh failure).
      ...(this.#signedOut ? { signOutReason: this.#signOutReason } : {}),
    });
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }
  report(source, reason) {
    if (reason) this.#issues.set(source, reason);
    else this.#issues.delete(source);
    this.#emit();
  }
  // Unknown callers default to 'expired' so a real expiry is never silenced. 'user' is sticky while
  // signed out: a late 401 after a deliberate logout must not turn it back into 'expired'.
  signedOut({ reason } = {}) {
    if (!(this.#signedOut && this.#signOutReason === 'user')) {
      this.#signOutReason = reason === 'user' ? 'user' : 'expired';
    }
    this.#signedOut = true;
    this.#emit();
  }
  authenticated() {
    if (this.#signedOut) this.#issues.clear();
    this.#signedOut = false;
    this.#signOutReason = null;
    this.#emit();
  }
  #emit() {
    const state = this.snapshot;
    for (const listener of this.#listeners) {
      try { listener(state); }
      catch (error) { console.warn('[connection] Listener failed', error); }
    }
  }
}
