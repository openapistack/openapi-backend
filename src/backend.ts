// library code, any is fine
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as _ from 'lodash';
import type { Options as AjvOpts } from 'ajv';
import OpenAPISchemaValidator from 'openapi-schema-validator';
import { parse as parseJSONSchema, dereference } from './refparser';
import { dereferenceSync } from 'dereference-json-schema';

import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import { mock, SchemaLike } from 'mock-json-schema';

import { OpenAPIRouter, Request, ParsedRequest, Operation, UnknownParams } from './router';
import { OpenAPIValidator, ValidationResult, AjvCustomizer } from './validation';
import OpenAPIUtils from './utils';

// alias Document to OpenAPIV3_1.Document
export type Document = OpenAPIV3_1.Document | OpenAPIV3.Document;
export type PickVersionElement<D extends Document, V30, V31> = D extends OpenAPIV3_1.Document ? V31 : V30;

// alias SecurityRequirement
export type SecurityRequirement = OpenAPIV3_1.SecurityRequirementObject | OpenAPIV3.SecurityRequirementObject;

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
 */
export interface Context<
  RequestBody = any,
  Params = UnknownParams,
  Query = UnknownParams,
  Headers = UnknownParams,
  Cookies = UnknownParams,
  D extends Document = Document,
> {
  api: OpenAPIBackend<D>;
  request: ParsedRequest<RequestBody, Params, Query, Headers, Cookies>;
  operation: Operation<D>;
  validation: ValidationResult;
  security: SecurityHandlerResults;
  response: any;
}

/**
 * A handler for an operation with request Context and passed arguments from handleRequest
 */
export type Handler<
  RequestBody = any,
  Params = UnknownParams,
  Query = UnknownParams,
  Headers = UnknownParams,
  Cookies = UnknownParams,
  D extends Document = Document,
> = (context: Context<RequestBody, Params, Query, Headers, Cookies, D>, ...args: any[]) => any | Promise<any>;

/**
 * Map of operation handlers
 */
export type HandlerMap = { [operationId: string]: Handler | undefined };

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
 * Constructor options
 *
 * @export
 * @interface Options
 */
export interface Options<D extends Document = Document> {
  definition: D | string;
  apiRoot?: string;
  strict?: boolean;
  quick?: boolean;
  validate?: boolean | BoolPredicate;
  ajvOpts?: AjvOpts;
  customizeAjv?: AjvCustomizer;
  handlers?: HandlerMap & {
    notFound?: Handler;
    notImplemented?: Handler;
    validationFail?: Handler;
  };
  securityHandlers?: HandlerMap;
  ignoreTrailingSlashes?: boolean;
}

/**
 * Main class and the default export of the 'openapi-backend' module
 *
 * @export
 * @class OpenAPIBackend
 */
export class OpenAPIBackend<D extends Document = Document> {
  public document: D;
  public inputDocument: D | string;
  public definition: D;
  public apiRoot: string;

  public initalized: boolean;

  public strict: boolean;
  public quick: boolean;
  public validate: boolean | BoolPredicate;
  public ignoreTrailingSlashes: boolean;

  public ajvOpts: AjvOpts;
  public customizeAjv: AjvCustomizer | undefined;

  public handlers: HandlerMap;
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

  public securityHandlers: HandlerMap;

  public router: OpenAPIRouter<D>;
  public validator: OpenAPIValidator<D>;

  /**
   * Creates an instance of OpenAPIBackend.
   *
   * @param opts - constructor options
   * @param {D | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {string} opts.apiRoot - the root URI of the api. all paths are matched relative to apiRoot
   * @param {boolean} opts.strict - strict mode, throw errors or warn on OpenAPI spec validation errors (default: false)
   * @param {boolean} opts.quick - quick startup, attempts to optimise startup; might break things (default: false)
   * @param {boolean} opts.validate - whether to validate requests with Ajv (default: true)
   * @param {boolean} opts.ignoreTrailingSlashes - whether to ignore trailing slashes when routing (default: true)
   * @param {boolean} opts.ajvOpts - default ajv opts to pass to the validator
   * @param {{ [operationId: string]: Handler | ErrorHandler }} opts.handlers - Operation handlers to be registered
   * @memberof OpenAPIBackend
   */
  constructor(opts: Options<D>) {
    const optsWithDefaults: Options<D> = {
      apiRoot: '/',
      validate: true,
      strict: false,
      quick: false,
      ignoreTrailingSlashes: true,
      handlers: {} as HandlerMap,
      securityHandlers: {} as HandlerMap,
      ...opts,
    };
    this.apiRoot = optsWithDefaults.apiRoot ?? '/';
    this.inputDocument = optsWithDefaults.definition;
    this.strict = !!optsWithDefaults.strict;
    this.quick = !!optsWithDefaults.quick;
    this.validate = !!optsWithDefaults.validate;
    this.ignoreTrailingSlashes = !!optsWithDefaults.ignoreTrailingSlashes;
    this.handlers = { ...optsWithDefaults.handlers  }; // Copy to avoid mutating passed object
    this.securityHandlers = { ...optsWithDefaults.securityHandlers }; // Copy to avoid mutating passed object
    this.ajvOpts = optsWithDefaults.ajvOpts ?? {};
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
        // in quick mode we don't care when the document is ready
        this.loadDocument();
      } else {
        await this.loadDocument();
      }

      if (!this.quick) {
        // validate the document
        this.validateDefinition();
      }

      // dereference the document into definition (make sure not to copy)
      if (typeof this.inputDocument === 'string') {
        this.definition = (await dereference(this.inputDocument)) as D;
      } else if (this.quick && typeof this.inputDocument === 'object') {
        // use sync dereference in quick mode
        this.definition = dereferenceSync(this.inputDocument) as D;
      } else {
        this.definition = (await dereference(this.document || this.inputDocument)) as D;
      }
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
    this.router = new OpenAPIRouter({
      definition: this.definition,
      apiRoot: this.apiRoot,
      ignoreTrailingSlashes: this.ignoreTrailingSlashes,
    });

    // initalize validator with dereferenced definition
    if (this.validate !== false) {
      this.validator = new OpenAPIValidator({
        definition: this.definition,
        ajvOpts: this.ajvOpts,
        customizeAjv: this.customizeAjv,
        router: this.router,
        lazyCompileValidators: Boolean(this.quick), // optimise startup by lazily compiling Ajv validators
      });
    }

    // we are initalized
    this.initalized = true;

    // register all handlers
    if (this.handlers) {
      this.register(this.handlers);
    }

    // register all security handlers
    if (this.securityHandlers) {
      for (const [name, handler] of Object.entries(this.securityHandlers)) {
        if (handler) {
          this.registerSecurityHandler(name, handler);
        }
      }
    }

    // return this instance
    return this;
  }

  /**
   * Loads the input document asynchronously and sets this.document
   *
   * @memberof OpenAPIBackend
   */
  public async loadDocument() {
    this.document = (await parseJSONSchema(this.inputDocument)) as D;
    return this.document;
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
  public async handleRequest(req: Request, ...handlerArgs: any[]): Promise<any> {
    if (!this.initalized) {
      // auto-initalize if not yet initalized
      await this.init();
    }

    // initalize context object with a reference to this OpenAPIBackend instance
    const context: Partial<Context<any, any, any, any, any, D>> = { api: this };

    // handle request with correct handler
    const response: any = await (async () => {
      // parse request
      context.request = this.router.parseRequest(req);

      // match operation (routing)
      try {
        context.operation = this.router.matchOperation(req, true);
      } catch (err) {
        let handler = this.handlers['404'] || this.handlers['notFound'];
        if (err instanceof Error && err.message.startsWith('405')) {
          // 405 method not allowed
          handler = this.handlers['405'] || this.handlers['methodNotAllowed'] || handler;
        }
        if (!handler) {
          throw err;
        }
        return handler(context as Context<D>, ...handlerArgs);
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
        securitySchemes.map(async (name) => {
          securityHandlerResults[name] = undefined;
          if (this.securityHandlers[name]) {
            const securityHandler = this.securityHandlers[name];
            // return a promise that will set the security handler result
            return await Promise.resolve()
              .then(() => securityHandler(context as Context<D>, ...handlerArgs))
              .then((result: unknown) => {
                securityHandlerResults[name] = result;
              })
              // save rejected error as result, if thrown
              .catch((error: unknown) => {
                securityHandlerResults[name] = { error };
              });
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
        for (const requirement of Object.keys(requirementObject)) {
          const requirementResult = securityHandlerResults[requirement];

          // falsy return values are treated as auth fail
          if (Boolean(requirementResult) === false) {
            return false;
          }

          // handle error object passed earlier
          if (
            typeof requirementResult === 'object' &&
            Object.keys(requirementResult).includes('error') &&
            Object.keys(requirementResult).length === 1
          ) {
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
      const authorized = requirementsSatisfied.some((securityResult) => securityResult === true);

      // add the results and authorized state to the context object
      context.security = {
        authorized,
        ...securityHandlerResults,
      };

      // call unauthorizedHandler handler if auth fails
      if (!authorized && securityRequirements.length > 0) {
        const unauthorizedHandler = this.handlers['unauthorizedHandler'];
        if (unauthorizedHandler) {
          return unauthorizedHandler(context as Context<D>, ...handlerArgs);
        }
      }

      // check whether this request should be validated
      const validate =
        typeof this.validate === 'function'
          ? this.validate(context as Context<D>, ...handlerArgs)
          : Boolean(this.validate);

      // validate request
      const validationFailHandler = this.handlers['validationFail'];
      if (validate) {
        context.validation = this.validator.validateRequest(req, context.operation);
        if (context.validation.errors) {
          // 400 request validation fail
          if (validationFailHandler) {
            return validationFailHandler(context as Context<D>, ...handlerArgs);
          }
          // if no validation handler is specified, just ignore it and proceed to route handler
        }
      }

      // get operation handler
      const routeHandler = this.handlers[operationId];
      if (!routeHandler) {
        // 501 not implemented
        const notImplementedHandler = this.handlers['501'] || this.handlers['notImplemented'];
        if (!notImplementedHandler) {
          throw Error(`501-notImplemented: ${operationId} no handler registered`);
        }
        return notImplementedHandler(context as Context<D>, ...handlerArgs);
      }

      // handle route
      return routeHandler(context as Context<D>, ...handlerArgs);
    }).bind(this)();

    // post response handler
    const postResponseHandler = this.handlers['postResponseHandler'];
    if (postResponseHandler) {
      // pass response to postResponseHandler
      context.response = response;
      return postResponseHandler(context as Context<D>, ...handlerArgs);
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
  public register<Handlers extends HandlerMap = HandlerMap>(handlers: Handlers): void;

  /**
   * Registers a handler for an operation
   *
   * Alias for: registerHandler
   *
   * @param {string} operationId
   * @param {Handler} handler
   * @memberof OpenAPIBackend
   */
  public register<OperationHandler = Handler>(operationId: string, handler: OperationHandler): void;

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
    let response: PickVersionElement<D, OpenAPIV3.ResponseObject, OpenAPIV3_1.ResponseObject>;

    if (opts.code && responses[opts.code]) {
      // 1. check for provided code opt (default: 200)
      status = Number(opts.code);
      response = responses[opts.code] as typeof response;
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
      const exampleObject = examples[opts.example] as PickVersionElement<
        D,
        OpenAPIV3.ExampleObject,
        OpenAPIV3_1.ExampleObject
      >;
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
      const exampleObject = examples[Object.keys(examples)[0]] as PickVersionElement<
        D,
        OpenAPIV3.ExampleObject,
        OpenAPIV3_1.ExampleObject
      >;
      return { status, mock: exampleObject.value };
    }

    // mock using json schema
    if (schema) {
      return { status, mock: mock(schema as SchemaLike) };
    }

    // we should never get here, schema or an example must be provided
    return { status, mock: defaultMock };
  }

  /**
   * Validates this.document, which is the parsed OpenAPI document. Throws an error if validation fails.
   *
   * @returns {D} parsed document
   * @memberof OpenAPIBackend
   */
  public validateDefinition(): D {
    const validateOpenAPI = new OpenAPISchemaValidator({ version: 3 });
    const { errors } = validateOpenAPI.validate(this.document);
    if (errors.length) {
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
   * @returns {Operation<D>[]}
   * @memberof OpenAPIBackend
   */
  public getOperations(): Operation<D>[] {
    return this.router.getOperations();
  }

  /**
   * Gets a single operation based on operationId
   *
   * Alias for: router.getOperation(operationId)
   *
   * @param {string} operationId
   * @returns {Operation<D>}
   * @memberof OpenAPIBackend
   */
  public getOperation(operationId: string): Operation<D> | undefined {
    return this.router.getOperation(operationId);
  }

  /**
   * Matches a request to an API operation (router)
   *
   * Alias for: router.matchOperation(req)
   *
   * @param {Request} req
   * @returns {Operation<D>}
   * @memberof OpenAPIBackend
   */
  public matchOperation(req: Request): Operation<D> | undefined {
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
   * @param {(Operation<D> | string)} [operation]
   * @returns {ValidationStatus}
   * @memberof OpenAPIBackend
   */
  public validateRequest(req: Request, operation?: Operation<D> | string): ValidationResult {
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
   * @param {(Operation<D> | string)} [operation]
   * @param {number} status
   * @returns {ValidationStatus}
   * @memberof OpenAPIBackend
   */
  public validateResponse(res: any, operation: Operation<D> | string, statusCode?: number): ValidationResult {
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
   * @param {(Operation<D> | string)} [operation]
   * @param {number} [opts.statusCode]
   * @param {SetMatchType} [opts.setMatchType] - one of 'any', 'superset', 'subset', 'exact'
   * @returns {ValidationStatus}
   * @memberof OpenAPIBackend
   */
  public validateResponseHeaders(
    headers: any,
    operation: Operation<D> | string,
    opts?: {
      statusCode?: number;
      setMatchType?: SetMatchType;
    },
  ): ValidationResult {
    return this.validator.validateResponseHeaders(headers, operation, opts);
  }
}
