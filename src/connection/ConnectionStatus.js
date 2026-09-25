/** One observable per AuthCore/client; unrelated successes cannot hide failures. */
export class ConnectionStatus {
  #listeners = new Set();
  #issues = new Map();
  #signedOut = false;
  get snapshot() {
    return Object.freeze({
      status: this.#signedOut ? 'signed_out' : this.#issues.size ? 'reconnecting' : 'connected',
      reason: this.#signedOut ? 'Authentication required' : [...this.#issues.values()].at(-1) || null,
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
  signedOut() { this.#signedOut = true; this.#emit(); }
  authenticated() {
    if (this.#signedOut) this.#issues.clear();
    this.#signedOut = false;
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
