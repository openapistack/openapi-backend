import { OpenAPIV3 } from 'openapi-types';
import { validate } from 'openapi-schema-validation';

interface ConstructorOpts {
  document: OpenAPIV3.Document;
}

export default class OpenAPIBackend {
  public static validateDefinition(definition: OpenAPIV3.Document) {
    const { valid, errors } = validate(definition, 3);
    if (!valid) {
      const prettyErrors = JSON.stringify(errors, null, 2);
      throw new Error(`Document is not valid OpenAPI. ${errors.length} validation errors:\n${prettyErrors}`);
    }
    return definition;
  }

  public document: OpenAPIV3.Document;

  constructor(opts: ConstructorOpts) {
    this.document = OpenAPIBackend.validateDefinition(opts.document);
  }
}
