import type { z } from 'zod';
import { identifierSchema } from '#src/shared/domain/identifier-schema';
import { newtype } from '#src/shared/domain/newtype';

export const IdempotencyKey = newtype('IdempotencyKey', identifierSchema);

export type IdempotencyKey = z.output<typeof IdempotencyKey.schema>;
