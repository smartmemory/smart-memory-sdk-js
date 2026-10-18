export class SubscriptionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Current plan, limits and billing ids. Includes `can_manage_billing` (boolean):
   * whether the caller may change the plan. Use it, not the member role, to enable billing buttons.
   * False for every caller of an internal comp tenant, whose billing a superadmin manages.
   * `billing_refusal` says why it is false: `''` (the caller can manage billing), `'api_key'`, `'not_admin'`
   * or `'comp'`. The body is returned as the service sent it.
   */
  async getCurrent() {
    return this.api.get('/subscription/current');
  }

  /**
   * Let a member of your organization manage billing (organization admins only).
   * Resolves to `{ user_id, listed: true }`: `listed` is the explicit list entry, not the effective permission
   * (an admin can manage billing either way, read it from `getCurrent()`). Idempotent. Grants no workspace access.
   */
  async grantBillingManager(userId) {
    return this.api.put(`/subscription/billing-managers/${encodeURIComponent(userId)}`);
  }

  /**
   * Take billing management back from a member (organization admins only).
   * Resolves to `{ user_id, listed: false }`. Idempotent.
   */
  async revokeBillingManager(userId) {
    return this.api.delete(`/subscription/billing-managers/${encodeURIComponent(userId)}`);
  }

  /**
   * Members an organization admin let manage billing. Resolves to `{ user_ids: [...] }`, current members of
   * your organization only. Any signed-in member may read it. Rejects with 403 for an API key.
   * An organization admin also gets `members`: one `{ user_id, email, name, is_admin, listed }` entry per current
   * member, `listed` being the explicit list entry. Everyone else gets no `members` key at all, so check for the key
   * rather than assuming an empty array.
   */
  async listBillingManagers() {
    return this.api.get('/subscription/billing-managers');
  }

  async upgrade(tier, paymentMethodId = null) {
    return this.api.post('/subscription/upgrade', {
      tier,
      payment_method_id: paymentMethodId
    });
  }

  async cancel(immediately = false) {
    return this.api.post(`/subscription/cancel?immediately=${immediately}`);
  }

  async createPortalSession() {
    return this.api.post('/subscription/portal');
  }

  async createCheckoutSession(tier, billingPeriod = 'monthly') {
    return this.api.post('/subscription/checkout', {
      tier,
      billing_period: billingPeriod
    });
  }
}
