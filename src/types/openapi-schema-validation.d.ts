declare module 'openapi-schema-validation' {
  export function validate(
    document: import('openapi-types').OpenAPIV3_1.Document,
    version: number,
  ): {
    valid: boolean;
    errors: any[];
  };
}
