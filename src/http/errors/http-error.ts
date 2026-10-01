import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';

export class HttpError extends Error implements IRespondable {
  constructor(
    private readonly status: number,
    message: string,
    private readonly details?: unknown,
  ) {
    super(message);
  }

  public response(): ErrorResponse {
    return {
      status: this.status,
      body:
        this.details === undefined
          ? { error: this.message }
          : { error: this.message, details: this.details },
    };
  }
}
