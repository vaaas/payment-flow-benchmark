import { z } from 'zod';

export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value)
  .refine(
    (value) =>
      !value.includes('\u0000') &&
      Buffer.from(value, 'utf8').toString('utf8') === value,
    'Identifier must contain valid PostgreSQL text',
  );
