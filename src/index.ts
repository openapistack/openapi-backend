import _ from 'lodash';
import Ajv from 'ajv';
import SwaggerParser from 'swagger-parser';
import { validate } from 'openapi-schema-validation';

import { OpenAPIV3 } from 'openapi-types';

type Handler = (...args: any[]) => Promise<any>;

export interface RequestObject {
  method: string;
  path: string;
  headers: {
    [key: string]: string | string[];
  };
  query?:
    | {
        [key: string]: string | string[];
      }
    | string;
  body?: any;
}

interface InputValidationSchema {
  title: string;
  type: string;
  additionalProperties?: boolean;
  properties: {
    [target: string]: OpenAPIV3.SchemaObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject;
  };
  required?: string[];
}

// normalises request
// - http method is lowercase
// - path leading slash 👍
// - path trailing slash 👎
// - path query string 👎
export function normalizeRequest(req: RequestObject) {
  return {
    ...req,
    path: (req.path || '')
      .trim()
      .split('?')[0] // remove query string
      .replace(/^\/*/, '/') // add leading slash
      .replace(/\/+$/, ''), // remove trailing slash
    method: req.method.trim().toLowerCase(),
  };
}

// parses request
// - parse json body
// - parse path params based on uri template
// - parse query string
// - parse cookies from headers
export function parseRequest(req: RequestObject, path?: string) {
  let requestBody;
  try {
    requestBody = JSON.parse(req.body);
  } catch {
    // suppress json parsing errors
  }

  // @TODO: parse query string from req.path + req.query
  // @TODO: parse cookie from headers
  const cookies = {};

  // normalize
  req = normalizeRequest(req);

  // parse path
  const paramPlaceholder = '{[^\\/]*}';
  const pathPattern = `^${path.replace(new RegExp(paramPlaceholder, 'g'), '([^\\/]+)').replace(/\//g, '\\/')}$`;
  const paramValueArray = new RegExp(pathPattern).exec(req.path).splice(1);
  const paramNameArray = (path.match(new RegExp(paramPlaceholder, 'g')) || []).map((param) =>
    param.replace(/[{}]/g, ''),
  );
  const params = _.zipObject(paramNameArray, paramValueArray);

  return {
    ...req,
    params,
    cookies,
    requestBody,
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
  definition: OpenAPIV3.Document | string;
  strict?: boolean;
  validate?: boolean;
  handlers?: {
    [handler: string]: Handler;
  };
}

export default class OpenAPIBackend {
  public definition: OpenAPIV3.Document;
  public strict: boolean;
  public validate: boolean;
  public handlers: { [operationId: string]: Handler };
  public initalized: boolean;

  private document: OpenAPIV3.Document | string;
  private internalHandlers = ['404', 'notFound', '501', 'notImplemented', '400', 'validationFail'];

  constructor(opts: ConstructorOpts) {
    this.document = opts.definition;
    this.strict = Boolean(opts.strict);
    this.validate = _.isNil(opts.validate) ? true : opts.validate;
    this.handlers = opts.handlers || {};
  }

  public async init() {
    if (!this.definition) {
      try {
        // load, dereference and valdidate definition
        this.definition = await SwaggerParser.dereference(this.document);
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
    }

    // register handlers
    if (this.handlers) {
      this.register(this.handlers);
    }

    this.initalized = true;
    return this;
  }

  public async handleRequest(req: RequestObject, ...handlerArgs: any[]) {
    if (!this.initalized) {
      // api has not yet been initalised
      await this.init();
    }

    const operation = this.matchOperation(req);

    if (!operation || !operation.operationId) {
      // 404, no route matches
      const notFoundHandler = this.handlers['404'] || this.handlers['notFound'];
      if (!notFoundHandler) {
        throw Error(`404-notFound: no route matches request`);
      }
      return notFoundHandler(...handlerArgs);
    }
    const { operationId } = operation;

    if (this.validate) {
      // validate route
      const { ajv, valid } = this.validateRequest(req);
      if (!valid) {
        // 400 request validation error
        const validationFailHandler = this.handlers['400'] || this.handlers['validationFail'];
        if (!validationFailHandler) {
          const prettyErrors = JSON.stringify(ajv.errors, null, 2);
          throw Error(`400-validationFail: ${operationId}, errors: ${prettyErrors}`);
        }
        return validationFailHandler(ajv.errors, ...handlerArgs);
      }
    }

    // handle route
    const routeHandler = this.handlers[operationId];
    if (!routeHandler) {
      // @TODO: add mock option to mock response based on operation responses
      // 501 not implemented
      const notImplementedHandler = this.handlers['501'] || this.handlers['notImplemented'];
      if (!notImplementedHandler) {
        throw Error(`501-notImplemented: ${operationId} no handler registered`);
      }
      return notImplementedHandler(...handlerArgs);
    }

    // handle route
    return routeHandler(...handlerArgs);
  }

  public validateRequest(req: RequestObject) {
    const ajv = new Ajv({
      coerceTypes: true,
    });

    const operation = this.matchOperation(req);

    const { params, query, headers, cookies, requestBody } = parseRequest(req, operation.path);

    const parameters = _.omitBy(
      {
        path: params,
        query,
        header: headers,
        cookie: cookies,
        requestBody,
      },
      _.isNil,
    );

    // build input validation schema for operation
    // @TODO: pre-build this for each operation for performance
    const schema: InputValidationSchema = {
      title: 'Request',
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'object',
          additionalProperties: false,
          properties: {},
          required: [],
        },
        query: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          required: [],
        },
        header: {
          type: 'object',
          additionalProperties: true,
          properties: {},
          required: [],
        },
        cookie: {
          type: 'object',
          additionalProperties: true,
          properties: {},
          required: [],
        },
      },
    };

    // params are dereferenced here, no reference objects.
    const operationParameters = operation.parameters || [];
    operationParameters.map((param: OpenAPIV3.ParameterObject) => {
      const target = schema.properties[param.in];
      if (param.required) {
        target.required.push(param.name);
      }
      target.properties[param.name] = param.schema as OpenAPIV3.SchemaObject;
    });

    if (operation.requestBody) {
      // @TODO: infer most specific media type from headers
      const mediaType = 'application/json';
      const jsonbody = (operation.requestBody as OpenAPIV3.RequestBodyObject).content[mediaType];
      if (jsonbody && jsonbody.schema) {
        schema.properties.requestBody = jsonbody.schema as OpenAPIV3.SchemaObject;
      }
    }

    return { ajv, valid: ajv.validate(schema, parameters) };
  }

  // flatten operations into an array with path + method
  public getOperations() {
    return _.chain(this.definition.paths)
      .entries()
      .flatMap(([path, methods]) =>
        _.map(_.entries(methods), ([method, operation]) => ({
          path,
          method,
          ...(operation as OpenAPIV3.OperationObject),
        })),
      )
      .value();
  }

  public getOperation(operationId: string) {
    return _.find(this.getOperations(), { operationId });
  }

  public matchOperation(req: RequestObject) {
    // normalize request for matching
    req = normalizeRequest(req);

    const operations = this.getOperations();

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
      const pathPattern = `^${path.replace(/\{.*\}/g, '([^/]+)').replace(/\//g, '\\/')}$`;
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
