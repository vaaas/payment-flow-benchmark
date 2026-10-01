import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';

export class CheckoutConflict extends Error implements IRespondable {
  constructor() {
    super('Business order reference already has a different checkout payload');
  }

  public response(): ErrorResponse {
    return { status: 409, body: { error: this.message } };
  }
}
