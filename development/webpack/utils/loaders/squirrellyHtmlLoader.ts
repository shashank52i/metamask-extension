import type { LoaderContext } from 'webpack';
import type { JSONSchema7 } from 'schema-utils/declarations/validate';
import type { FromSchema } from 'json-schema-to-ts';
import { validate } from 'schema-utils';
import { render } from 'squirrelly';

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: true,
} as const satisfies JSONSchema7;

export type SquirrellyHtmlLoaderOptions = FromSchema<typeof schema>;

type Context = LoaderContext<SquirrellyHtmlLoaderOptions>;
export default function squirrellyHtmlLoader(this: Context, content: string) {
  const options = this.getOptions();
  validate(schema, options, { name: 'squirrellyHtmlLoader' });
  return render(content, options);
}
