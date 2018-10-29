import _ from 'lodash';
import Ajv from 'ajv';
import { OpenAPIV3 } from 'openapi-types';
import { validate as validateOpenAPI } from 'openapi-schema-validation';
import SwaggerParser from 'swagger-parser';

import { normalizeRequest, parseRequest, RequestObject } from './util/request';

// export public interfaces
export type Document = OpenAPIV3.Document;
export type Handler = (...args: any[]) => Promise<any>;
export type ErrorHandler = (errors: any, ...args: any[]) => Promise<any>;
export { RequestObject } from './util/request';

/**
 * OAS Operation Object containing the path and method so it can be placed in a flat array of operations
 *
 * @interface FlatOperation
 * @extends {OpenAPIV3.OperationObject}
 */
interface FlatOperation extends OpenAPIV3.OperationObject {
  path: string;
  method: string;
  parentParameters?: OpenAPIV3.ParameterObject[];
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

/**
 * Main class and the default export of the 'openapi-backend' module
 *
 * @export
 * @class OpenAPIBackend
 */
export class OpenAPIBackend {
  public document: Document;
  public inputDocument: Document | string;
  public definition: Document;

  public strict: boolean;
  public validate: boolean;
  public initalized: boolean;

  public handlers: { [operationId: string]: Handler };
  public allowedHandlers = ['notFound', 'notImplemented', 'validationFail'];

  public ajvOpts: Ajv.Options = { coerceTypes: true };
  public schemas: { [operationId: string]: Ajv.ValidateFunction };

  /**
   * Creates an instance of OpenAPIBackend.
   *
   * @param opts - constructor options
   * @param {Document | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {boolean} opts.strict - strict mode, throw errors or warn on OpenAPI spec validation errors (default: false)
   * @param {boolean} opts.validate - whether to validate requests with Ajv (default: true)
   * @param {{ [operationId: string]: Handler | ErrorHandler }} opts.handlers - Operation handlers to be registered
   * @memberof OpenAPIBackend
   */
  constructor(opts: {
    definition: Document | string;
    strict?: boolean;
    validate?: boolean;
    handlers?: {
      notFound?: Handler;
      notImplemented?: Handler;
      validationFail?: ErrorHandler;
      [handler: string]: Handler;
    };
  }) {
    const optsWithDefaults = {
      validate: true,
      strict: false,
      handlers: {},
      ...opts,
    };
    this.inputDocument = optsWithDefaults.definition;
    this.strict = optsWithDefaults.strict;
    this.validate = optsWithDefaults.validate;
    this.handlers = optsWithDefaults.handlers;
    this.schemas = {};
  }

  /**
   * Initalizes OpenAPIBackend.
   *
   * 1. Loads and parses the OpenAPI document passed in constructor options
   * 2. Validates the OpenAPI document
   * 3. Builds validation schemas for all API operations
   * 4. Marks property `initalized` to true
   * 5. Registers all [Operation Handlers](#operation-handlers) passed in constructor options
   *
   * The init() method should be called right after creating a new instance of OpenAPIBackend
   *
   * @returns parent instance of OpenAPIBackend
   * @memberof OpenAPIBackend
   */
  public async init() {
    try {
      // parse the document
      this.document = await SwaggerParser.parse(this.inputDocument);

      // validate the document
      this.validateDefinition();

      // dereference the document into definition
      this.definition = await SwaggerParser.dereference(this.document);
    } catch (err) {
      if (this.strict) {
        // in strict-mode, fail hard and re-throw the error
        throw err;
      } else {
        // just emit a warning about the validation errors
        console.warn(err);
      }
    }

    // build schemas for all operations
    const operations = this.getOperations();
    operations.map(this.buildSchemaForOperation.bind(this));

    // now that the definition is loaded and dereferenced, we are initalized
    this.initalized = true;

    // trigger registering all handlers now that we are initalized to valdiate them
    if (this.handlers) {
      this.register(this.handlers);
    }

    // return this instance
    return this;
  }

  /**
   * Handles a request
   * 1. Routing: Matches the request to an API operation
   * 2. Validation: Validates the request against the API operation schema
   * 3. Handling: Passes the request on to a registered handler
   *
   * @param {RequestObject} req
   * @param {...any[]} handlerArgs
   * @returns {Promise} handler return value
   * @memberof OpenAPIBackend
   */
  public async handleRequest(req: RequestObject, ...handlerArgs: any[]) {
    if (!this.initalized) {
      // auto-initalize if not yet initalized
      await this.init();
    }

    // match operation
    const operation = this.matchOperation(req);
    if (!operation || !operation.operationId) {
      const notFoundHandler: Handler = this.handlers['404'] || this.handlers['notFound'];
      if (!notFoundHandler) {
        throw Error(`404-notFound: no route matches request`);
      }
      return notFoundHandler(...handlerArgs);
    }

    const { operationId } = operation;

    // validate against route
    if (this.validate) {
      const valid = this.validateRequest(req);
      if (valid.errors) {
        // validation FAIL
        const validationFailHandler: ErrorHandler = this.handlers['validationFail'];
        if (!validationFailHandler) {
          const prettyErrors = JSON.stringify(valid.errors, null, 2);
          throw Error(`400-validationFail: ${operationId}, errors: ${prettyErrors}`);
        }
        return validationFailHandler(valid.errors, ...handlerArgs);
      }
    }

    // validation PASS
    // handle route
    const routeHandler: Handler = this.handlers[operationId];
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

  /**
   * Validates a request and returns the result.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to
   * validate it.
   *
   * @param {RequestObject} req - request to validate
   * @returns {Ajv.ValidateFunction}
   * @memberof OpenAPIBackend
   */
  public validateRequest(req: RequestObject): Ajv.ValidateFunction {
    const operation = this.matchOperation(req);
    const { operationId } = operation;

    // get pre-compiled ajv schema for operation
    const validate = this.schemas[operationId];

    // build a parameter object to validate
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

    // validate parameters against pre-compiled schema
    validate(parameters);
    return validate;
  }

  /**
   * Registers multiple operation handlers
   *
   * @param {{ [operationId: string]: Handler }} handlers
   * @memberof OpenAPIBackend
   */
  public register(handlers: { [operationId: string]: Handler }): void {
    for (const operationId in handlers) {
      if (handlers[operationId]) {
        this.registerHandler(operationId, handlers[operationId]);
      }
    }
  }

  /**
   * Registers a handler for an operation
   *
   * @param {string} operationId
   * @param {Handler | ErrorHandler} handler
   * @memberof OpenAPIBackend
   */
  public registerHandler(operationId: string, handler: Handler | ErrorHandler): void {
    // make sure we are registering a function and not anything else
    if (typeof handler !== 'function') {
      throw new Error('Handler should be a function');
    }

    // if initalized, check that operation matches an operationId or is one of our allowed handlers
    if (this.initalized) {
      const operation = this.getOperation(operationId);
      if (!operation && !_.includes(this.allowedHandlers, operationId)) {
        const err = `Unknown operationId ${operationId}`;
        // in strict mode, throw Error, otherwise just emit a warning
        if (this.strict) {
          throw new Error(`${err}. Refusing to register handler`);
        } else {
          console.warn(err);
        }
      }
    }

    // register the handler
    this.handlers[operationId] = handler;
  }

  /**
   * Validates this.document, which is the parsed OpenAPI document. Throws an error if validation fails.
   *
   * @returns {Document} parsed document
   * @memberof OpenAPIBackend
   */
  public validateDefinition() {
    const { valid, errors } = validateOpenAPI(this.document, 3);
    if (!valid) {
      const prettyErrors = JSON.stringify(errors, null, 2);
      throw new Error(`Document is not valid OpenAPI. ${errors.length} validation errors:\n${prettyErrors}`);
    }
    return this.document;
  }

  /**
   * Builds an Ajv schema validation function for an operation and registers it
   *
   * @param {FlatOperation} operation
   * @memberof OpenAPIBackend
   */
  public buildSchemaForOperation(operation: FlatOperation): void {
    const { operationId } = operation;
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
      required: [],
    };

    // params are dereferenced here, no reference objects.
    const operationParameters = [...operation.parameters, ...operation.parentParameters];
    operationParameters.map((param: OpenAPIV3.ParameterObject) => {
      const target = schema.properties[param.in];
      if (param.required) {
        target.required.push(param.name);
        schema.required = _.uniq([...schema.required, param.in]);
      }
      target.properties[param.name] = param.schema as OpenAPIV3.SchemaObject;
    });

    if (operation.requestBody) {
      // @TODO: infer most specific media type from headers
      const mediaType = 'application/json';
      const jsonbody = (operation.requestBody as OpenAPIV3.RequestBodyObject).content[mediaType];
      if (jsonbody && jsonbody.schema) {
        schema.properties.requestBody = jsonbody.schema as OpenAPIV3.SchemaObject;
        schema.required.push('requestBody');
      }
    }

    // build the schema and register it
    const ajv = new Ajv(this.ajvOpts);
    this.schemas[operationId] = ajv.compile(schema);
  }

  /**
   * Flattens operations into a simple array of FlatOperation objects easy to work with
   *
   * @returns {FlatOperation[]}
   * @memberof OpenAPIBackend
   */
  public getOperations(): FlatOperation[] {
    const paths = _.get(this.definition, 'paths', {});
    return _.chain(paths)
      .entries()
      .flatMap(([path, pathBaseObject]) => {
        const methods = _.pick(pathBaseObject, ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
        return _.map(_.entries(methods), ([method, operation]) => ({
          path,
          method,
          parameters: [],
          parentParameters: (pathBaseObject.parameters as OpenAPIV3.ParameterObject[]) || [],
          ...(operation as OpenAPIV3.OperationObject),
        }));
      })
      .value();
  }

  /**
   * Gets a single operation based on operationId
   *
   * @param {string} operationId
   * @returns {FlatOperation}
   * @memberof OpenAPIBackend
   */
  public getOperation(operationId: string): FlatOperation {
    return _.find(this.getOperations(), { operationId });
  }

  /**
   * Matches a request to an API operation (router)
   *
   * @param {RequestObject} req
   * @returns {FlatOperation}
   * @memberof OpenAPIBackend
   */
  public matchOperation(req: RequestObject): FlatOperation {
    // normalize request for matching
    req = normalizeRequest(req);

    // get all operations matching request method in a flat array
    const operations = _.filter(this.getOperations(), ({ method }) => method === req.method);

    // first check for an exact match for path
    const exactMatch = _.find(operations, ({ path }) => path === req.path);
    if (exactMatch) {
      return exactMatch;
    }

    // then check for matches using path templating
    return _.find(operations, ({ path }) => {
      // convert openapi path template to a regex pattern i.e. /{id}/ becomes /[^/]+/
      const pathPattern = `^${path.replace(/\{.*\}/g, '[^/]+').replace(/\//g, '\\/')}$`;
      return Boolean(req.path.match(new RegExp(pathPattern, 'g')));
    });
  }
}
