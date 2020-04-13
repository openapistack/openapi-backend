declare module 'openapi-schema-validation' {
  export function validate(
    document: import('openapi-types').OpenAPIV3.Document,
    version: number,
  ): {
    valid: boolean;
    errors: any[];
  };
}
