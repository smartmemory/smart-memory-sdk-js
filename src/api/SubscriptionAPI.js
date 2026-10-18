export class SubscriptionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Current plan, limits and billing ids. Includes `can_manage_billing` (boolean):
   * whether the caller may change the plan. Use it, not the member role, to enable billing buttons.
   */
  async getCurrent() {
    return this.api.get('/subscription/current');
  }

  /**
   * Let a member of your organization manage billing (organization admins only).
   * Resolves to `{ user_id, can_manage_billing: true }`. Idempotent. Grants no workspace access.
   */
  async grantBillingManager(userId) {
    return this.api.put(`/subscription/billing-managers/${encodeURIComponent(userId)}`);
  }

  /**
   * Take billing management back from a member (organization admins only).
   * Resolves to `{ user_id, can_manage_billing: false }`. Idempotent.
   */
  async revokeBillingManager(userId) {
    return this.api.delete(`/subscription/billing-managers/${encodeURIComponent(userId)}`);
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
