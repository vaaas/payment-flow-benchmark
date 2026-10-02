import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

export const CurrencyCode = newtype(
  'CurrencyCode',
  zod.string().regex(/^[A-Z]{3}$/),
);

export type CurrencyCode = z.output<typeof CurrencyCode.schema>;
