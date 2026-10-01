import { z } from 'zod';

export const requestIdentifier = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value);
