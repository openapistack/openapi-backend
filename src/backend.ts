import * as _ from 'lodash';
import * as Ajv from 'ajv';
import { validate as validateOpenAPI } from 'openapi-schema-validation';
import * as SwaggerParser from 'swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import { mock } from 'mock-json-schema';

import { OpenAPIRouter, Request, ParsedRequest, Operation } from './router';
import { OpenAPIValidator, ValidationResult, AjvCustomizer } from './validation';
import OpenAPIUtils from './utils';

// alias Document to OpenAPIV3.Document
export type Document = OpenAPIV3.Document;

// alias SecurityRequirement
export type SecurityRequirement = OpenAPIV3.SecurityRequirementObject;

/**
 * Security / Authorization context for requests
 */
interface SecurityHandlerResults {
  [name: string]: any;
}
export interface SecurityContext extends SecurityHandlerResults {
  authorized: boolean;
}

/**
 * Passed context built for request. Passed as first argument for all handlers.
 *
 * @export
 * @interface Context
 */
export interface Context {
  api: OpenAPIBackend;
  request: ParsedRequest;
  operation: Operation;
  validation: ValidationResult;
  security: SecurityHandlerResults;
  response: any;
}

export type Handler = (context: Context, ...args: any[]) => any | Promise<any>;
export type BoolPredicate = (context: Context, ...args: any[]) => boolean;

/**
 * The different possibilities for set matching.
 *
 * @enum {string}
 */
export enum SetMatchType {
  Any = 'any',
  Superset = 'superset',
  Subset = 'subset',
  Exact = 'exact',
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
  public apiRoot: string;

  public initalized: boolean;

  public strict: boolean;
  public quick: boolean;
  public validate: boolean | BoolPredicate;

  public ajvOpts: Ajv.Options;
  public customizeAjv: AjvCustomizer | undefined;

  public handlers: { [operationId: string]: Handler };
  public allowedHandlers = [
    '404',
    'notFound',
    '405',
    'methodNotAllowed',
    '501',
    'notImplemented',
    '400',
    'validationFail',
    'unauthorizedHandler',
    'postResponseHandler',
  ];

  public securityHandlers: { [name: string]: Handler };

  public router: OpenAPIRouter;
  public validator: OpenAPIValidator;

  /**
   * Creates an instance of OpenAPIBackend.
   *
   * @param opts - constructor options
   * @param {Document | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {string} opts.apiRoot - the root URI of the api. all paths are matched relative to apiRoot
   * @param {boolean} opts.strict - strict mode, throw errors or warn on OpenAPI spec validation errors (default: false)
   * @param {boolean} opts.quick - quick startup, attempts to optimise startup; might break things (default: false)
   * @param {boolean} opts.validate - whether to validate requests with Ajv (default: true)
   * @param {boolean} opts.ajvOpts - default ajv opts to pass to the validator
   * @param {{ [operationId: string]: Handler | ErrorHandler }} opts.handlers - Operation handlers to be registered
   * @memberof OpenAPIBackend
   */
  constructor(opts: {
    definition: Document | string;
    apiRoot?: string;
    strict?: boolean;
    quick?: boolean;
    validate?: boolean | BoolPredicate;
    ajvOpts?: Ajv.Options;
    customizeAjv?: AjvCustomizer;
    handlers?: {
      notFound?: Handler;
      notImplemented?: Handler;
      validationFail?: Handler;
      [handler: string]: Handler | undefined;
    };
    securityHandlers?: {};
  }) {
    const optsWithDefaults = {
      apiRoot: '/',
      validate: true,
      strict: false,
      quick: false,
      ajvOpts: {},
      handlers: {},
      securityHandlers: {},
      ...opts,
    };
    this.apiRoot = optsWithDefaults.apiRoot;
    this.inputDocument = optsWithDefaults.definition;
    this.strict = optsWithDefaults.strict;
    this.quick = optsWithDefaults.quick;
    this.validate = optsWithDefaults.validate;
    this.handlers = optsWithDefaults.handlers;
    this.securityHandlers = optsWithDefaults.securityHandlers;
    this.ajvOpts = optsWithDefaults.ajvOpts;
    this.customizeAjv = optsWithDefaults.customizeAjv;
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
      if (this.quick) {
        // we don't care when the document is ready
        SwaggerParser.parse(this.inputDocument).then((doc) => {
          this.document = doc;
        });
      } else {
        this.document = await SwaggerParser.parse(this.inputDocument);
      }

      if (!this.quick) {
        // validate the document
        this.validateDefinition();
      }

      // dereference the document into definition (make sure not to copy)
      this.definition = await SwaggerParser.dereference(this.inputDocument);
    } catch (err) {
      if (this.strict) {
        // in strict-mode, fail hard and re-throw the error
        throw err;
      } else {
        // just emit a warning about the validation errors
        console.warn(err);
      }
    }

    // initalize router with dereferenced definition
    this.router = new OpenAPIRouter({ definition: this.definition, apiRoot: this.apiRoot });

    // initalize validator with dereferenced definition
    if (this.validate !== false) {
      this.validator = new OpenAPIValidator({
        definition: this.definition,
        ajvOpts: this.ajvOpts,
        customizeAjv: this.customizeAjv,
        router: this.router,
      });
    }

    // we are initalized
    this.initalized = true;

    // register all handlers
    if (this.handlers) {
      this.register(this.handlers);
    }

    // register all handlers
    if (this.securityHandlers) {
      _.entries(this.securityHandlers).map(([name, handler]) => {
        this.registerSecurityHandler(name, handler);
      });
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

    // initalize context object with a reference to this OpenAPIBackend instance
    const context: Partial<Context> = { api: this };

    // handle request with correct handler
    const response = await (async () => {
      // parse request
      context.request = this.router.parseRequest(req);

      // match operation (routing)
      try {
        context.operation = this.router.matchOperation(req, true);
      } catch (err) {
        let handler = this.handlers['404'] || this.handlers['notFound'];
        if (err.message.startsWith('405')) {
          // 405 method not allowed
          handler = this.handlers['405'] || this.handlers['methodNotAllowed'] || handler;
        }
        if (!handler) {
          throw err;
        }
        return handler(context as Context, ...handlerArgs);
      }

      const operationId = context.operation.operationId as string;

      // parse request again now with matched operation
      context.request = this.router.parseRequest(req, context.operation);

      // get security requirements for the matched operation
      // global requirements are already included in the router
      const securityRequirements = context.operation.security || [];
      const securitySchemes = _.flatMap(securityRequirements, _.keys);

      // run registered security handlers for all security requirements
      const securityHandlerResults: SecurityHandlerResults = {};
      await Promise.all(
        securitySchemes.map((name) => {
          securityHandlerResults[name] = undefined;
          if (this.securityHandlers[name]) {
            // return a promise that will set the security handler result
            return (
              Promise.resolve()
                .then(async () => await this.securityHandlers[name](context as Context, ...handlerArgs))
                .then((result) => {
                  securityHandlerResults[name] = result;
                })
                // save error as result, if thrown
                .catch((error) => {
                  securityHandlerResults[name] = { error };
                })
            );
          } else {
            // if no handler is found for scheme, set to undefined
            securityHandlerResults[name] = undefined;
          }
        }),
      );

      // auth logic
      const requirementsSatisfied = securityRequirements.map((requirementObject) => {
        /*
         * Security Requirement Objects that contain multiple schemes require
         * that all schemes MUST be satisfied for a request to be authorized.
         */
        for (const requirement of _.keys(requirementObject)) {
          if (!Boolean(securityHandlerResults[requirement]) || Boolean(securityHandlerResults[requirement]?.error)) {
            return false;
          }
        }
        return true;
      });
      /*
       * When a list of Security Requirement Objects is defined on the Open API
       * object or Operation Object, only one of Security Requirement Objects
       * in the list needs to be satisfied to authorize the request.
       */
      const authorized = _.includes(requirementsSatisfied, true);

      // add the results and authorized state to the context object
      context.security = {
        authorized,
        ...securityHandlerResults,
      };

      // call unauthorizedHandler handler if auth fails
      if (!authorized && securityRequirements.length > 0) {
        const unauthorizedHandler: Handler = this.handlers['unauthorizedHandler'];
        if (unauthorizedHandler) {
          return unauthorizedHandler(context as Context, ...handlerArgs);
        }
      }

      // check whether this request should be validated
      const validate =
        typeof this.validate === 'function'
          ? this.validate(context as Context, ...handlerArgs)
          : Boolean(this.validate);

      // validate request
      const validationFailHandler: Handler = this.handlers['validationFail'];
      if (validate) {
        context.validation = this.validator.validateRequest(req, context.operation);
        if (context.validation.errors) {
          // 400 request validation fail
          if (validationFailHandler) {
            return validationFailHandler(context as Context, ...handlerArgs);
          }
          // if no validation handler is specified, just ignore it and proceed to route handler
        }
      }

      // get operation handler
      const routeHandler: Handler = this.handlers[operationId];
      if (!routeHandler) {
        // 501 not implemented
        const notImplementedHandler = this.handlers['501'] || this.handlers['notImplemented'];
        if (!notImplementedHandler) {
          throw Error(`501-notImplemented: ${operationId} no handler registered`);
        }
        return notImplementedHandler(context as Context, ...handlerArgs);
      }

      // handle route
      return routeHandler(context as Context, ...handlerArgs);
    }).bind(this)();

    // post response handler
    const postResponseHandler: Handler = this.handlers['postResponseHandler'];
    if (postResponseHandler) {
      // pass response to postResponseHandler
      context.response = response;
      return postResponseHandler(context as Context, ...handlerArgs);
    }

    // return response
    return response;
  }

  /**
   * Registers a handler for an operation
   *
   * @param {string} operationId
   * @param {Handler} handler
   * @memberof OpenAPIBackend
   */
  public registerHandler(operationId: string, handler: Handler): void {
    // make sure we are registering a function and not anything else
    if (typeof handler !== 'function') {
      throw new Error('Handler should be a function');
    }

    // if initalized, check that operation matches an operationId or is one of our allowed handlers
    if (this.initalized) {
      const operation = this.router.getOperation(operationId);
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
   * Registers multiple handlers
   *
   * @param {{ [operationId: string]: Handler }} handlers
   * @memberof OpenAPIBackend
   */
  public register(handlers: { [operationId: string]: Handler }): void;

  /**
   * Registers a handler for an operation
   *
   * Alias for: registerHandler
   *
   * @param {string} operationId
   * @param {Handler} handler
   * @memberof OpenAPIBackend
   */
  public register(operationId: string, handler: Handler): void;

  /**
   * Overloaded register() implementation
   *
   * @param {...any[]} args
   * @memberof OpenAPIBackend
   */
  public register(...args: any[]): void {
    if (typeof args[0] === 'string') {
      // register a single handler
      const operationId: string = args[0];
      const handler: Handler = args[1];
      this.registerHandler(operationId, handler);
    } else {
      // register multiple handlers
      const handlers: { [operationId: string]: Handler } = args[0];
      for (const operationId in handlers) {
        if (handlers[operationId]) {
          this.registerHandler(operationId, handlers[operationId]);
        }
      }
    }
  }

  /**
   * Registers a security handler for a security scheme
   *
   * @param {string} name - security scheme name
   * @param {Handler} handler - security handler
   * @memberof OpenAPIBackend
   */
  public registerSecurityHandler(name: string, handler: Handler): void {
    // make sure we are registering a function and not anything else
    if (typeof handler !== 'function') {
      throw new Error('Security handler should be a function');
    }

    // if initialized, check that operation matches a security scheme
    if (this.initalized) {
      const securitySchemes = this.definition.components?.securitySchemes || {};
      if (!securitySchemes[name]) {
        const err = `Unknown security scheme ${name}`;
        // in strict mode, throw Error, otherwise just emit a warning
        if (this.strict) {
          throw new Error(`${err}. Refusing to register security handler`);
        } else {
          console.warn(err);
        }
      }
    }

    // register the handler
    this.securityHandlers[name] = handler;
  }

  /**
   * Mocks a response for an operation based on example or response schema
   *
   * @param {string} operationId - operationId of the operation for which to mock the response
   * @param {object} opts - (optional) options
   * @param {number} opts.responseStatus - (optional) the response code of the response to mock (default: 200)
   * @param {string} opts.mediaType - (optional) the media type of the response to mock (default: application/json)
   * @param {string} opts.example - (optional) the specific example to use (if operation has multiple examples)
   * @returns {{ status: number; mock: any }}
   * @memberof OpenAPIBackend
   */
  public mockResponseForOperation(
    operationId: string,
    opts: {
      code?: number;
      mediaType?: string;
      example?: string;
    } = {},
  ): { status: number; mock: any } {
    let status = 200;
    const defaultMock = {};

    const operation = this.router.getOperation(operationId);
    if (!operation || !operation.responses) {
      return { status, mock: defaultMock };
    }

    // resolve status code
    const { responses } = operation;
    let response: OpenAPIV3.ResponseObject;

    if (opts.code && responses[opts.code]) {
      // 1. check for provided code opt (default: 200)
      status = Number(opts.code);
      response = responses[opts.code] as OpenAPIV3.ResponseObject;
    } else {
      // 2. check for a default response
      const res = OpenAPIUtils.findDefaultStatusCodeMatch(responses);
      status = res.status;
      response = res.res;
    }

    if (!response || !response.content) {
      return { status, mock: defaultMock };
    }
    const { content } = response;

    // resolve media type
    // 1. check for mediaType opt in content (default: application/json)
    // 2. pick first media type in content
    const mediaType = opts.mediaType || 'application/json';
    const mediaResponse = content[mediaType] || content[Object.keys(content)[0]];
    if (!mediaResponse) {
      return { status, mock: defaultMock };
    }
    const { examples, schema } = mediaResponse;

    // if example argument was provided, locate and return its value
    if (opts.example && examples) {
      const exampleObject = examples[opts.example] as OpenAPIV3.ExampleObject;
      if (exampleObject && exampleObject.value) {
        return { status, mock: exampleObject.value };
      }
    }

    // if operation has an example, return its value
    if (mediaResponse.example) {
      return { status, mock: mediaResponse.example };
    }

    // pick the first example from examples
    if (examples) {
      const exampleObject = examples[Object.keys(examples)[0]] as OpenAPIV3.ExampleObject;
      return { status, mock: exampleObject.value };
    }

    // mock using json schema
    if (schema) {
      return { status, mock: mock(schema as OpenAPIV3.SchemaObject) };
    }

    // we should never get here, schema or an example must be provided
    return { status, mock: defaultMock };
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
   * Flattens operations into a simple array of Operation objects easy to work with
   *
   * Alias for: router.getOperations()
   *
   * @returns {Operation[]}
   * @memberof OpenAPIBackend
   */
  public getOperations(): Operation[] {
    return this.router.getOperations();
  }

  /**
   * Gets a single operation based on operationId
   *
   * Alias for: router.getOperation(operationId)
   *
   * @param {string} operationId
   * @returns {Operation}
   * @memberof OpenAPIBackend
   */
  public getOperation(operationId: string): Operation | undefined {
    return this.router.getOperation(operationId);
  }

  /**
   * Matches a request to an API operation (router)
   *
   * Alias for: router.matchOperation(req)
   *
   * @param {Request} req
   * @returns {Operation}
   * @memberof OpenAPIBackend
   */
  public matchOperation(req: Request): Operation | undefined {
    return this.router.matchOperation(req);
  }

  /**
   * Validates a request and returns the result.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schemas to
   * validate it.
   *
   * Alias for validator.validateRequest
   *
   * @param {Request} req - request to validate
   * @param {(Operation | string)} [operation]
   * @returns {ValidationStatus}
   * @memberof OpenAPIBackend
   */
  public validateRequest(req: Request, operation?: Operation | string): ValidationResult {
    return this.validator.validateRequest(req, operation);
  }

  /**
   * Validates a response and returns the result.
   *
   * The method will use the pre-compiled Ajv validation schema to validate a request it.
   *
   * Alias for validator.validateResponse
   *
   * @param {*} res - response to validate
   * @param {(Operation | string)} [operation]
   * @param {number} status
   * @returns {ValidationStatus}
   * @memberof OpenAPIBackend
   */
  public validateResponse(res: any, operation: Operation | string, statusCode?: number): ValidationResult {
    return this.validator.validateResponse(res, operation, statusCode);
  }

  /**
   * Validates response headers and returns the result.
   *
   * The method will use the pre-compiled Ajv validation schema to validate a request it.
   *
   * Alias for validator.validateResponseHeaders
   *
   * @param {*} headers - response to validate
   * @param {(Operation | string)} [operation]
   * @param {number} [opts.statusCode]
   * @param {SetMatchType} [opts.setMatchType] - one of 'any', 'superset', 'subset', 'exact'
   * @returns {ValidationStatus}
   * @memberof OpenAPIBackend
   */
  public validateResponseHeaders(
    headers: any,
    operation: Operation | string,
    opts?: {
      statusCode?: number;
      setMatchType?: SetMatchType;
    },
  ): ValidationResult {
    return this.validator.validateResponseHeaders(headers, operation, opts);
  }
}
