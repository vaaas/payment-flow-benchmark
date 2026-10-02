import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

export const RequestLimit = newtype(
  'RequestLimit',
  zod.number().int().positive(),
);

export type RequestLimit = z.output<typeof RequestLimit.schema>;
