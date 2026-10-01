export type Checkout = Readonly<{
  businessOrderReference: string;
  amountMinor: string;
  currency: string;
}>;

export class CreateCheckout {
  public readonly payload: Checkout;

  constructor(payload: Checkout) {
    this.payload = Object.freeze({ ...payload });
    Object.freeze(this);
  }
}
