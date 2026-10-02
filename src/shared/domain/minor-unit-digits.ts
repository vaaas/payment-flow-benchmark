import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

export const MinorUnitDigits = newtype(
  'MinorUnitDigits',
  zod.number().int().min(0).max(6),
);

export type MinorUnitDigits = z.output<typeof MinorUnitDigits.schema>;
