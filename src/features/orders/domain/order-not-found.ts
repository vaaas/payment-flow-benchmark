import { HttpStatus } from '#src/shared/response/http-status';
import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';

export class OrderNotFound extends Error implements IRespondable {
  constructor() {
    super('Order not found');
  }

  public response(): ErrorResponse {
    return { status: HttpStatus.notFound, body: { error: this.message } };
  }
}
