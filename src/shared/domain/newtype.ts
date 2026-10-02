import type { z } from 'zod';

export function newtype<Tag extends string, Schema extends z.ZodType>(
  _tag: Tag,
  schema: Schema,
) {
  const branded = schema.brand<Tag>();
  return {
    schema: branded,
    parse: (input: unknown): z.output<typeof branded> =>
      branded.parse(input) as z.output<typeof branded>,
  };
}
