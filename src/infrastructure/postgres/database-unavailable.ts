import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';

export class DatabaseUnavailable extends Error implements IRespondable {
  constructor() {
    super('Cannot connect to the database; retry later');
  }

  public response(): ErrorResponse {
    return { status: 503, body: { error: this.message } };
  }
}
