import _ from 'lodash';
import { OpenAPIV3 } from 'openapi-types';
import { validate } from 'openapi-schema-validation';

interface ConstructorOpts {
  document: OpenAPIV3.Document;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

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

  public matchOperation(matchPath: string, matchMethod: HttpMethod): OpenAPIV3.OperationObject {
    const operations = _.chain(this.document.paths)
      // flatten operations into an array with path + method
      .entries()
      .flatMap(([path, methods]) =>
        _.map(_.entries(methods), ([method, operation]) => ({
          path,
          method,
          ...(operation as OpenAPIV3.OperationObject),
        })),
      )
      .value();

    // first check for an exact match
    const exactMatch = _.find(
      operations,
      ({ path, method }) => method === matchMethod && path === matchPath.replace(/\/+$/, ''),
    );
    if (exactMatch) {
      return exactMatch;
    }

    // check for path templating
    const templateMatch = _.find(operations, ({ path, method }) => {
      if (method !== matchMethod) {
        return false;
      }
      // convert openapi path template to a regex pattern. {id} becomes ([^/]+)
      const pathPattern = `^${path.replace(/\{.*\}/g, '([^/]+)').replace(/\//g, '\\/')}\\/?$`;
      return Boolean(matchPath.match(new RegExp(pathPattern, 'g')));
    });
    return templateMatch;
  }
}
