import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';

export class ProviderEventConflict extends Error implements IRespondable {
  constructor() {
    super('Provider event ID already has a different payload');
  }

  public response(): ErrorResponse {
    return { status: 409, body: { error: this.message } };
  }
}
