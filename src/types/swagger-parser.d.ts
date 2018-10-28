declare module 'swagger-parser' {
  type Document = import('openapi-types').OpenAPIV3.Document;
  interface Options {
    allow?: {
      json?: boolean;
      yaml?: boolean;
      empty?: boolean;
      unknown?: boolean;
    };
    $ref?: {
      internal?: boolean;
      external?: boolean;
      circular?: boolean | 'ignore';
    };
    validate?: {
      schema?: boolean;
      spec?: boolean;
    };
    cache?: {
      fs?: number;
      http?: number;
      https?: number;
    };
  }
  function parse(api: string | Document, options?: Options): Promise<Document>;
  function validate(api: string | Document, options?: Options): Promise<Document>;
  function dereference(api: string | Document, options?: Options): Promise<Document>;
  function bundle(api: string | Document, options?: Options): Promise<Document>;
}
