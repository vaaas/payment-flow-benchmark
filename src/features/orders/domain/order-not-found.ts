import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';

export class OrderNotFound extends Error implements IRespondable {
  constructor() {
    super('Order not found');
  }

  public response(): ErrorResponse {
    return { status: 404, body: { error: this.message } };
  }
}
