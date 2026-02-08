export class SubscriptionAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async getCurrent() {
    return this.api.get('/subscription/current');
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
