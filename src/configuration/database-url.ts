import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

export const DatabaseUrl = newtype(
  'DatabaseUrl',
  zod
    .string()
    .url()
    .pipe(
      zod.string().refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === 'postgres:' || protocol === 'postgresql:';
      }, 'DATABASE_URL must use a PostgreSQL URL'),
    ),
);

export type DatabaseUrl = z.output<typeof DatabaseUrl.schema>;
