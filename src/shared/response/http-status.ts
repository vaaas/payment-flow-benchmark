import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

const httpStatus = newtype('HttpStatus', zod.number().int().min(100).max(599));

export type HttpStatus = z.output<typeof httpStatus.schema>;

export const HttpStatus = {
  ...httpStatus,
  ok: httpStatus.parse(200),
  created: httpStatus.parse(201),
  badRequest: httpStatus.parse(400),
  unauthorized: httpStatus.parse(401),
  notFound: httpStatus.parse(404),
  conflict: httpStatus.parse(409),
  tooManyRequests: httpStatus.parse(429),
  serviceUnavailable: httpStatus.parse(503),
  isClientError: (status: number): boolean => status >= 400 && status < 500,
};
