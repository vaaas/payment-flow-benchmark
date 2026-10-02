import type { z } from 'zod';
import { identifierSchema } from '#src/shared/domain/identifier-schema';
import { newtype } from '#src/shared/domain/newtype';

export const BusinessOrderReference = newtype(
  'BusinessOrderReference',
  identifierSchema,
);

export type BusinessOrderReference = z.output<
  typeof BusinessOrderReference.schema
>;
