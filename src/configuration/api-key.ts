import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

export const ApiKey = newtype('ApiKey', zod.string().regex(/^\S+$/));

export type ApiKey = z.output<typeof ApiKey.schema>;
