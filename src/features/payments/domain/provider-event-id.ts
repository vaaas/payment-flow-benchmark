import type { z } from 'zod';
import { identifierSchema } from '#src/shared/domain/identifier-schema';
import { newtype } from '#src/shared/domain/newtype';

export const ProviderEventId = newtype('ProviderEventId', identifierSchema);

export type ProviderEventId = z.output<typeof ProviderEventId.schema>;
