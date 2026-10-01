export type ErrorResponse = Readonly<{
  status: number;
  body: Readonly<{ error: string; details?: unknown }>;
}>;

export interface IRespondable {
  response(): ErrorResponse;
}

export function isRespondable(value: unknown): value is IRespondable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'response' in value &&
    typeof value.response === 'function'
  );
}
