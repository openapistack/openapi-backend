import _ from 'lodash';
import { OpenAPIV3 } from 'openapi-types';
import { validate } from 'openapi-schema-validation';
import { normalize } from 'path';

type Handler = (...args: any[]) => Promise<any>;

export interface RequestObject {
  method: string;
  path: string;
  headers: {
    [key: string]: string | string[];
  };
  query?: {
    [key: string]: string | string[];
  };
  body?: any;
}

export function normalizeRequest(req: RequestObject) {
  return {
    ...req,
    path: req.path
      .trim()
      .split('?')[0] // remove query string
      .replace(/^\/*/, '/') // add leading slash
      .replace(/\/+$/, ''), // remove trailing slash
    method: req.method.trim().toLowerCase(),
  };
}

export function validateDefinition(definition: OpenAPIV3.Document) {
  const { valid, errors } = validate(definition, 3);
  if (!valid) {
    const prettyErrors = JSON.stringify(errors, null, 2);
    throw new Error(`Document is not valid OpenAPI. ${errors.length} validation errors:\n${prettyErrors}`);
  }
  return definition;
}

interface ConstructorOpts {
  document: OpenAPIV3.Document;
  strict?: boolean;
  handlers?: { [operationId: string]: Handler };
}

export default class OpenAPIBackend {
  public definition: OpenAPIV3.Document;
  public strict: boolean;
  public handlers: { [operationId: string]: Handler };

  private internalHandlers = ['404', 'notFound', '501', 'notImplemented'];

  constructor(opts: ConstructorOpts) {
    this.definition = opts.document;
    this.strict = Boolean(opts.strict);
    this.handlers = {};

    // validate definition
    try {
      validateDefinition(this.definition);
    } catch (err) {
      if (this.strict) {
        // in strict-mode, fail hard and re-throw the error
        throw err;
      } else {
        // just emit a warning about the validation errors
        console.warn(err);
      }
    }

    // register handlers
    if (opts.handlers) {
      this.register(opts.handlers);
    }
  }

  public async validateRequest(req: RequestObject) {
    const operation = this.matchOperation(req);

    // @TODO: perform Ajv validation for input
    return true;
  }

  public async handleRequest(req: RequestObject, ...handlerArgs: any[]) {
    const operation = this.matchOperation(req);

    if (!operation || !operation.operationId) {
      // 404, no route matches
      const notFoundHandler = this.handlers['404'] || this.handlers['notFound'];
      if (!notFoundHandler) {
        throw Error(`operation not found for request and no 404|notFound handler was registered`);
      }
      return notFoundHandler(...handlerArgs);
    }

    // handle route
    const { operationId } = operation;
    if (!operationId || !this.handlers[operationId]) {
      // @TODO: add mock option to mock response based on operation responses
      // 501 not implemented
      const notImplementedHandler = this.handlers['501'] || this.handlers['notImplemented'];
      if (!notImplementedHandler) {
        throw Error(`no handler registered for ${operationId} and no 501|notImplemented handler was registered`);
      }
      return notImplementedHandler(...handlerArgs);
    }

    // handle route
    const routeHandler = this.handlers[operationId];
    return routeHandler(...handlerArgs);
  }

  public getOperation(operationId: string): OpenAPIV3.OperationObject {
    return (
      _.chain(this.definition.paths)
        // flatten operations into an array
        .values()
        .flatMap(_.values)
        // match operationId
        .find({ operationId } as any)
        .value()
    );
  }

  public matchOperation(req: RequestObject): OpenAPIV3.OperationObject {
    // normalize request for matching
    req = normalizeRequest(req);

    const operations = _.chain(this.definition.paths)
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
    const exactMatch = _.find(operations, ({ path, method }) => method === req.method && path === req.path);
    if (exactMatch) {
      return exactMatch;
    }

    // check for path templating
    const templateMatch = _.find(operations, ({ path, method }) => {
      if (method !== req.method) {
        return false;
      }
      // convert openapi path template to a regex pattern. {id} becomes ([^/]+)
      const pathPattern = `^${path.replace(/\{.*\}/g, '([^/]+)').replace(/\//g, '\\/')}\\/?$`;
      return Boolean(req.path.match(new RegExp(pathPattern, 'g')));
    });
    return templateMatch;
  }

  public register(handlers: { [operationId: string]: Handler }): void {
    for (const operationId in handlers) {
      if (handlers[operationId]) {
        this.registerHandler(operationId, handlers[operationId]);
      }
    }
  }

  public registerHandler(operationId: string, handler: Handler): void {
    if (typeof handler !== 'function') {
      throw new Error('Handler should be a function');
    }
    const operation = this.getOperation(operationId);
    if (!operation && !_.includes(this.internalHandlers, operationId)) {
      const err = `Unknown operationId ${operationId}`;
      if (this.strict) {
        throw new Error(`${err}. Refusing to register handler`);
      } else {
        console.warn(err);
      }
    }
    this.handlers[operationId] = handler;
  }
}
