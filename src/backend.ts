import _ from 'lodash';
import Ajv from 'ajv';
import { validate as validateOpenAPI } from 'openapi-schema-validation';
import SwaggerParser from 'swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import { normalizeRequest, parseRequest, Request, ParsedRequest } from './util/request';
import { mock } from 'mock-json-schema';

// export public interfaces
export type Document = OpenAPIV3.Document;
export { Request, ParsedRequest } from './util/request';

/**
 * OAS Operation Object containing the path and method so it can be placed in a flat array of operations
 *
 * @export
 * @interface Operation
 * @extends {OpenAPIV3.OperationObject}
 */
export interface Operation extends OpenAPIV3.OperationObject {
  path: string;
  method: string;
}

/**
 * Passed context built for request. Passed as first argument for all handlers.
 *
 * @export
 * @interface Context
 */
export interface Context {
  request?: ParsedRequest;
  operation?: Operation;
  validation?: Ajv.ValidateFunction;
}

export type Handler = (context?: Context, ...args: any[]) => Promise<any>;

/**
 * The internal JSON schema model to validate InputParameters against
 *
 * @interface InputValidationSchema
 */
interface InputValidationSchema {
  title: string;
  type: 'object';
  additionalProperties?: boolean;
  properties: {
    [target: string]: OpenAPIV3.SchemaObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject;
  };
  required?: string[];
}

/**
 * The internal input parameters object to validate against InputValidateSchema
 *
 * @interface InputParameters
 */
interface InputParameters {
  path?: { [param: string]: string };
  query?: { [param: string]: string };
  header?: { [header: string]: string };
  cookie?: { [cookie: string]: string };
  requestBody?: any;
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

  public initalized: boolean;

  public strict: boolean;
  public validate: boolean;
  public withContext: boolean;

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
   * @param {boolean} opts.withContext - whether to pass context object to handlers as first argument (default: true)
   * @param {{ [operationId: string]: Handler | ErrorHandler }} opts.handlers - Operation handlers to be registered
   * @memberof OpenAPIBackend
   */
  constructor(opts: {
    definition: Document | string;
    strict?: boolean;
    validate?: boolean;
    withContext?: boolean;
    handlers?: {
      notFound?: Handler;
      notImplemented?: Handler;
      validationFail?: Handler;
      [handler: string]: Handler;
    };
  }) {
    const optsWithDefaults = {
      withContext: true,
      validate: true,
      strict: false,
      handlers: {},
      ...opts,
    };
    this.inputDocument = optsWithDefaults.definition;
    this.strict = optsWithDefaults.strict;
    this.validate = optsWithDefaults.validate;
    this.handlers = optsWithDefaults.handlers;
    this.withContext = optsWithDefaults.withContext;
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
   * @param {Request} req
   * @param {...any[]} handlerArgs
   * @returns {Promise} handler return value
   * @memberof OpenAPIBackend
   */
  public async handleRequest(req: Request, ...handlerArgs: any[]) {
    if (!this.initalized) {
      // auto-initalize if not yet initalized
      await this.init();
    }

    // initalize api context object
    const context: Context = {};

    // parse request
    context.request = parseRequest(req);

    // match operation
    context.operation = this.matchOperation(req);
    if (!context.operation || !context.operation.operationId) {
      const notFoundHandler: Handler = this.handlers['404'] || this.handlers['notFound'];
      if (!notFoundHandler) {
        throw Error(`404-notFound: no route matches request`);
      }
      return this.withContext ? notFoundHandler(context, ...handlerArgs) : notFoundHandler(...handlerArgs);
    }

    const { path, operationId } = context.operation;

    // parse request again now with matched path
    context.request = parseRequest(req, path);

    // validate against route
    if (this.validate) {
      context.validation = this.validateRequest(req);
      if (context.validation.errors) {
        // validation FAIL
        const validationFailHandler: Handler = this.handlers['validationFail'];
        if (validationFailHandler) {
          return this.withContext
            ? validationFailHandler(context, ...handlerArgs)
            : validationFailHandler(...handlerArgs);
        }
        // if no validation handler is specified, just proceed to route handler (context.validation is still populated)
      }
    }

    // handle route
    const routeHandler: Handler = this.handlers[operationId];
    if (!routeHandler) {
      // 501 not implemented
      const notImplementedHandler = this.handlers['501'] || this.handlers['notImplemented'];
      if (!notImplementedHandler) {
        throw Error(`501-notImplemented: ${operationId} no handler registered`);
      }
      return this.withContext ? notImplementedHandler(context, ...handlerArgs) : notImplementedHandler(...handlerArgs);
    }

    // handle route
    return this.withContext ? routeHandler(context, ...handlerArgs) : routeHandler(...handlerArgs);
  }

  /**
   * Validates a request and returns the result.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to
   * validate it.
   *
   * @param {Request} req - request to validate
   * @returns {Ajv.ValidateFunction}
   * @memberof OpenAPIBackend
   */
  public validateRequest(req: Request): Ajv.ValidateFunction {
    const operation = this.matchOperation(req);
    const { operationId } = operation;

    // get pre-compiled ajv schema for operation
    const validate = this.schemas[operationId];

    // build a parameter object to validate
    const { params, query, headers, cookies, requestBody } = parseRequest(req, operation.path);

    const parameters: InputParameters = _.omitBy(
      {
        path: params,
        query,
        header: headers,
        cookie: cookies,
      },
      _.isNil,
    );

    if (typeof req.body !== 'object') {
      const payloadFormats = _.keys(_.get(operation, 'requestBody.content', {}));
      if (payloadFormats.length === 1 && payloadFormats[0] === 'application/json') {
        // check that JSON isn't malformed when the only payload format is JSON
        try {
          JSON.parse(req.body.toString());
        } catch (err) {
          validate.errors = [
            {
              keyword: 'parse',
              dataPath: '',
              schemaPath: '#/requestBody',
              params: [],
              message: err.message,
            },
          ];
          return validate;
        }
      }
    }

    if (typeof requestBody === 'object' || headers['content-type'] === 'application/json') {
      // include request body in validation if an object is provided
      parameters.requestBody = requestBody;
    }

    // validate parameters against pre-compiled schema
    validate(parameters);
    return validate;
  }

  /**
   * Matches a request to an API operation (router)
   *
   * @param {Request} req
   * @returns {Operation}
   * @memberof OpenAPIBackend
   */
  public matchOperation(req: Request): Operation {
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
  public registerHandler(operationId: string, handler: Handler): void {
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
   * @param {Operation} operation
   * @memberof OpenAPIBackend
   */
  public buildSchemaForOperation(operation: Operation): void {
    const { operationId } = operation;
    const schema: InputValidationSchema = {
      title: 'Request',
      type: 'object',
      additionalProperties: true,
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
    const { parameters } = operation;
    parameters.map((param: OpenAPIV3.ParameterObject) => {
      const target = schema.properties[param.in];
      if (param.required) {
        target.required.push(param.name);
        schema.required = _.uniq([...schema.required, param.in]);
      }
      target.properties[param.name] = param.schema as OpenAPIV3.SchemaObject;
    });

    if (operation.requestBody) {
      const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
      const jsonbody = requestBody.content['application/json'];
      if (jsonbody && jsonbody.schema) {
        schema.properties.requestBody = jsonbody.schema as OpenAPIV3.SchemaObject;
        if (_.keys(requestBody.content).length === 1) {
          // if application/json is the only specified format, it's required
          schema.required.push('requestBody');
        }
      }
    }

    // build the schema and register it
    const ajv = new Ajv(this.ajvOpts);
    this.schemas[operationId] = ajv.compile(schema);
  }

  /**
   * Mocks a response for an operation based on example or response schema
   *
   * @param {string} operationId - operationId of the operation for which to mock the response
   * @param {object} opts - (optional) options
   * @param {number} opts.responseStatus - (optional) the response code of the response to mock (default: 200)
   * @param {string} opts.mediaType - (optional) the media type of the response to mock (default: application/json)
   * @param {string} opts.example - (optional) the specific example to use (if operation has multiple examples)
   * @returns {*}
   * @memberof OpenAPIBackend
   */
  public mockResponseForOperation(
    operationId: string,
    opts?: {
      code?: number;
      mediaType?: string;
      example?: string;
    },
  ): any {
    const { example, responseStatus, mediaType } = { responseStatus: 200, mediaType: 'application/json', ...opts };

    const operation = this.getOperation(operationId);

    const defaultMock = {};
    if (!operation || !operation.responses) {
      return defaultMock;
    }

    // choose response code
    // 1. check for responseStatus opt (default: 200)
    // 2. check for the "default" response
    // 3. pick first response code in list
    const { responses } = operation;
    const response = (responses[responseStatus] ||
      responses.default ||
      responses[_.first(_.keys(responses))]) as OpenAPIV3.ResponseObject;
    if (!response || !response.content) {
      return defaultMock;
    }

    // choose media type
    // 1. check for mediaType opt in content (default: application/json)
    // 2. pick first media type in content
    const { content } = response;
    const mediaResponse = content[mediaType] || content[_.first(_.keys(content))];
    if (!mediaResponse) {
      return defaultMock;
    }

    const { examples, schema } = mediaResponse;

    // if example argument was provided, locate and return its value
    if (example && examples) {
      const exampleObject = examples[example] as OpenAPIV3.ExampleObject;
      if (exampleObject && exampleObject.value) {
        return exampleObject.value;
      }
    }

    // if operation has an example, return its value
    if (mediaResponse.example && mediaResponse.example.value) {
      return mediaResponse.example.value;
    }

    // pick the first example from examples
    if (examples) {
      const exampleObject = examples[_.first(_.keys(examples))] as OpenAPIV3.ExampleObject;
      return exampleObject.value;
    }

    if (schema) {
      return mock(schema as OpenAPIV3.SchemaObject);
    }
    return defaultMock;
  }

  /**
   * Flattens operations into a simple array of Operation objects easy to work with
   *
   * @returns {Operation[]}
   * @memberof OpenAPIBackend
   */
  public getOperations(): Operation[] {
    const paths = _.get(this.definition, 'paths', {});
    return _.chain(paths)
      .entries()
      .flatMap(([path, pathBaseObject]) => {
        const methods = _.pick(pathBaseObject, ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
        return _.map(_.entries(methods), ([method, operation]) => ({
          ...(operation as OpenAPIV3.OperationObject),
          path,
          method,
          // add the path base object's operations to the operation's parameters
          parameters: [
            ...((operation.parameters as OpenAPIV3.ParameterObject[]) || []),
            ...((pathBaseObject.parameters as OpenAPIV3.ParameterObject[]) || []),
          ],
        }));
      })
      .value();
  }

  /**
   * Gets a single operation based on operationId
   *
   * @param {string} operationId
   * @returns {Operation}
   * @memberof OpenAPIBackend
   */
  public getOperation(operationId: string): Operation {
    return _.find(this.getOperations(), { operationId });
  }
}
