// @apidevtools/json-schema-ref-parser is ESM-only. Load it lazily with a dynamic import() so this
// CommonJS module works without require(esm), which is disabled e.g. on AWS Lambda.
// https://github.com/openapistack/openapi-backend/issues/1042
const importRefParser = () => import('@apidevtools/json-schema-ref-parser');
type RefParserStatic = Awaited<ReturnType<typeof importRefParser>>['$RefParser'];

let refParserPromise: Promise<RefParserStatic> | undefined;

const loadRefParser = (): Promise<RefParserStatic> => {
  if (!refParserPromise) {
    refParserPromise = importRefParser().then((mod) => mod.$RefParser ?? mod.default);
    // allow retrying after a failed import
    refParserPromise.catch(() => {
      refParserPromise = undefined;
    });
  }
  return refParserPromise;
};

// call static methods via the class to keep `this` bound
// https://github.com/APIDevTools/json-schema-ref-parser/issues/139
export const parse = async (schema: object | string): Promise<unknown> => (await loadRefParser()).parse(schema);

export const resolve = async (schema: object | string): Promise<unknown> => (await loadRefParser()).resolve(schema);

export const dereference = async (schema: object | string): Promise<unknown> =>
  (await loadRefParser()).dereference(schema);
