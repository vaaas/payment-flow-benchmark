import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

const milliseconds = newtype(
  'Milliseconds',
  zod.number().finite().nonnegative(),
);

export type Milliseconds = z.output<typeof milliseconds.schema>;

export const Milliseconds = {
  ...milliseconds,
  plus: (left: Milliseconds, right: Milliseconds): Milliseconds =>
    milliseconds.parse(left + right),
  minus: (left: Milliseconds, right: Milliseconds): Milliseconds =>
    milliseconds.parse(left - right),
  isAtLeast: (left: Milliseconds, right: Milliseconds): boolean =>
    left >= right,
};
