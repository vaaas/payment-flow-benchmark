export class CheckoutConflict extends Error {
  constructor() {
    super('Business order reference already has a different checkout payload');
  }
}
