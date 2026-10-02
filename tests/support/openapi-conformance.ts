import openApiSpec from '#openapi';

type Schema = {
  $ref?: string;
  type?: string;
  enum?: unknown[];
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
};

const uuidFormat =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolve(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace('#/components/schemas/', '');
  const resolved = (openApiSpec.components.schemas as Record<string, Schema>)[
    name
  ];
  if (!resolved) throw new Error(`Unknown schema reference ${schema.$ref}`);
  return resolve(resolved);
}

export function schemaNamed(name: string): Schema {
  return resolve({ $ref: `#/components/schemas/${name}` });
}

export function violations(
  schema: Schema,
  value: unknown,
  path = '$',
): string[] {
  const resolved = resolve(schema);
  const problems: string[] = [];
  if (resolved.type === 'string') {
    if (typeof value !== 'string') return [`${path} is not a string`];
    if (resolved.minLength !== undefined && value.length < resolved.minLength)
      problems.push(`${path} is shorter than ${resolved.minLength}`);
    if (resolved.maxLength !== undefined && value.length > resolved.maxLength)
      problems.push(`${path} is longer than ${resolved.maxLength}`);
    if (resolved.pattern && !new RegExp(resolved.pattern).test(value))
      problems.push(`${path} does not match ${resolved.pattern}`);
    if (resolved.enum && !resolved.enum.includes(value))
      problems.push(`${path} is not one of ${resolved.enum.join(', ')}`);
    if (resolved.format === 'uuid' && !uuidFormat.test(value))
      problems.push(`${path} is not a UUID`);
    if (
      resolved.format === 'date-time' &&
      new Date(value).toISOString() !== value
    )
      problems.push(`${path} is not a UTC ISO date-time`);
  } else if (resolved.type === 'boolean') {
    if (typeof value !== 'boolean') problems.push(`${path} is not a boolean`);
  } else if (resolved.type === 'array') {
    if (!Array.isArray(value)) return [`${path} is not an array`];
    if (resolved.items)
      for (const [index, item] of value.entries())
        problems.push(...violations(resolved.items, item, `${path}[${index}]`));
  } else if (resolved.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return [`${path} is not an object`];
    const record = value as Record<string, unknown>;
    for (const key of resolved.required ?? [])
      if (!(key in record)) problems.push(`${path}.${key} is missing`);
    for (const [key, entry] of Object.entries(record)) {
      const property = resolved.properties?.[key];
      if (property)
        problems.push(...violations(property, entry, `${path}.${key}`));
      else if (resolved.additionalProperties === false)
        problems.push(`${path}.${key} is not allowed`);
    }
  }
  return problems;
}

export function documentedStatuses(
  path: keyof typeof openApiSpec.paths,
  method: string,
): string[] {
  const operations = openApiSpec.paths[path] as Record<
    string,
    { responses: Record<string, unknown> }
  >;
  const operation = operations[method];
  if (!operation) throw new Error(`${method} ${path} is not documented`);
  return Object.keys(operation.responses);
}

export { openApiSpec };
