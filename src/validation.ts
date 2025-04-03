// library code, any is fine
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as _ from 'lodash';
import Ajv, { Options as AjvOpts, ErrorObject, FormatDefinition, ValidateFunction } from 'ajv';
import type { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import { OpenAPIRouter, Request, Operation } from './router';
import OpenAPIUtils from './utils';
import { PickVersionElement, SetMatchType } from './backend';

// alias Document to OpenAPIV3_1.Document
type Document = OpenAPIV3_1.Document | OpenAPIV3.Document;

/**
 * The output object for validationRequest. Contains the results for validation
 *
 * @export
 * @interface ValidationStatus
 */
export interface ValidationResult<T = any> {
  valid: boolean;
  errors?: ErrorObject[] | null;
  coerced?: T;
}

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
    [target: string]: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ArraySchemaObject | OpenAPIV3_1.NonArraySchemaObject;
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

interface ResponseHeadersValidateFunctionMap {
  [statusCode: string]: { [setMatchType: string]: ValidateFunction };
}

interface StatusBasedResponseValidatorsFunctionMap {
  [statusCode: string]: ValidateFunction;
}

export enum ValidationContext {
  RequestBody = 'requestBodyValidator',
  Params = 'paramsValidator',
  Response = 'responseValidator',
  ResponseHeaders = 'responseHeadersValidator',
}

export type AjvCustomizer = (originalAjv: Ajv, ajvOpts: AjvOpts, validationContext: ValidationContext) => Ajv;

/**
 * Returns a function that validates that a signed number is within the given bit range
 * @param {number} bits
 */
function getBitRangeValidator(bits: number) {
  const max = Math.pow(2, bits - 1);

  return (value: number) => value >= -max && value < max;
}

// Formats defined by the OAS
const defaultFormats: Record<string, FormatDefinition<any>> = {
  int32: {
    // signed 32 bits
    type: 'number',
    validate: getBitRangeValidator(32),
  },
  int64: {
    // signed 64 bits (a.k.a long)
    type: 'number',
    validate: getBitRangeValidator(64),
  },
  float: {
    type: 'number',
    validate: () => true,
  },
  double: {
    type: 'number',
    validate: () => true,
  },
  byte: {
    // base64 encoded characters
    type: 'string',
    validate: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  },
  binary: {
    // any sequence of octets
    type: 'string',
    validate: () => true,
  },
  password: {
    // A hint to UIs to obscure input.
    type: 'string',
    validate: () => true,
  },
};

/**
 * Class that handles JSON schema validation
 *
 * @export
 * @class OpenAPIValidator
 */
export class OpenAPIValidator<D extends Document = Document> {
  public definition: D;
  public ajvOpts: AjvOpts;
  public lazyCompileValidators: boolean;
  public customizeAjv: AjvCustomizer | undefined;
  public coerceTypes: boolean;

  public requestValidators: { [operationId: string]: ValidateFunction[] | null };
  public responseValidators: { [operationId: string]: ValidateFunction | null };
  public statusBasedResponseValidators: { [operationId: string]: StatusBasedResponseValidatorsFunctionMap | null };
  public responseHeadersValidators: { [operationId: string]: ResponseHeadersValidateFunctionMap | null };

  public router: OpenAPIRouter<D>;

  /**
   * Creates an instance of OpenAPIValidation
   *
   * @param opts - constructor options
   * @param {Document | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {object} opts.ajvOpts - default ajv constructor opts (default: { unknownFormats: 'ignore' })
   * @param {OpenAPIRouter} opts.router - passed instance of OpenAPIRouter. Will create own child if no passed
   * @param {boolean} opts.lazyCompileValidators - skips precompiling Ajv validators and compiles only when needed
   * @param {boolean} opts.coerceTypes - coerce types in request query and path parameters
   * @memberof OpenAPIRequestValidator
   */
  constructor(opts: {
    definition: D;
    ajvOpts?: AjvOpts;
    router?: OpenAPIRouter<D>;
    lazyCompileValidators?: boolean;
    customizeAjv?: AjvCustomizer;
    coerceTypes?: boolean;
  }) {
    this.definition = opts.definition;
    this.ajvOpts = {
      strict: false,
      ...(opts.ajvOpts || {}),
    };

    this.customizeAjv = opts.customizeAjv;
    this.coerceTypes = opts.coerceTypes || false;

    // initalize router
    this.router = opts.router || new OpenAPIRouter({ definition: this.definition });

    // initialize validator stores
    this.requestValidators = {};
    this.responseValidators = {};
    this.statusBasedResponseValidators = {};
    this.responseHeadersValidators = {};

    // precompile validators if not in lazy mode
    if (!opts.lazyCompileValidators) {
      this.preCompileRequestValidators();
      this.preCompileResponseValidators();
      this.preCompileResponseHeaderValidators();
    }
  }

  /**
   * Pre-compiles Ajv validators for requests of all api operations
   *
   * @memberof OpenAPIValidator
   */
  public preCompileRequestValidators(): void {
    const operations = this.router.getOperations();
    for (const operation of operations) {
      const operationId = OpenAPIUtils.getOperationId(operation);
      this.requestValidators[operationId] = this.buildRequestValidatorsForOperation(operation);
    }
  }

  /**
   * Pre-compiles Ajv validators for responses of all api operations
   *
   * @memberof OpenAPIValidator
   */
  public preCompileResponseValidators(): void {
    const operations = this.router.getOperations();
    for (const operation of operations) {
      const operationId = OpenAPIUtils.getOperationId(operation);
      this.responseValidators[operationId] = this.buildResponseValidatorForOperation(operation);
      this.statusBasedResponseValidators[operationId] = this.buildStatusBasedResponseValidatorForOperation(operation);
    }
  }

  /**
   * Pre-compiles Ajv validators for response headers of all api operations
   *
   * @memberof OpenAPIValidator
   */
  public preCompileResponseHeaderValidators(): void {
    const operations = this.router.getOperations();
    for (const operation of operations) {
      const operationId = OpenAPIUtils.getOperationId(operation);
      this.responseHeadersValidators[operationId] = this.buildResponseHeadersValidatorForOperation(operation);
    }
  }

  /**
   * Validates a request against prebuilt Ajv validators and returns the validation result.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to
   * validate it.
   *
   * @param {Request} req - request to validate
   * @param {(Operation<D> | string)} operation - operation to validate against
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateRequest(req: Request, operation?: Operation<D> | string): ValidationResult<Request> {
    const result: ValidationResult = { valid: true, coerced: { ...req } };
    result.errors = [];

    if (!operation) {
      operation = this.router.matchOperation(req);
    } else if (typeof operation === 'string') {
      operation = this.router.getOperation(operation);
    }

    if (!operation || !operation.operationId) {
      throw new Error(`Unknown operation`);
    }

    // get pre-compiled ajv schemas for operation
    const { operationId } = operation;
    const validators = this.getRequestValidatorsForOperation(operationId) || [];

    // build a parameter object to validate
    const { params, query, headers, cookies, requestBody } = this.router.parseRequest(req, operation);

    // convert singular query parameters to arrays if specified as array in operation parametes
    if (query) {
      for (const [name, value] of _.entries(query)) {
        if (typeof value === 'string') {
          const operationParameter = _.find(operation.parameters, { name, in: 'query' });
          if (operationParameter) {
            const { schema } = operationParameter as PickVersionElement<
              D,
              OpenAPIV3.ParameterObject,
              OpenAPIV3_1.ParameterObject
            >;
            if (
              schema &&
              (schema as PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>).type === 'array'
            ) {
              query[name] = [value];
            }
          }
        }
      }
    }

    const parameters: InputParameters = _.omitBy(
      {
        path: params,
        query,
        header: headers,
        cookie: cookies,
      },
      _.isNil,
    );

    if (typeof req.body !== 'object' && req.body !== undefined) {
      const payloadFormats = _.keys(_.get(operation, 'requestBody.content', {}));
      if (payloadFormats.length === 1 && payloadFormats[0] === 'application/json') {
        // check that JSON isn't malformed when the only payload format is JSON
        try {
          JSON.parse(`${req.body}`);
        } catch (err) {
          if (err instanceof Error) {
            result.errors.push({
              keyword: 'parse',
              instancePath: '',
              schemaPath: '#/requestBody',
              params: [],
              message: err.message,
            });
          }
        }
      }
    }

    if (typeof requestBody === 'object' || headers['content-type'] === 'application/json') {
      // include request body in validation if an object is provided
      parameters.requestBody = requestBody;
    }

    // validate parameters against each pre-compiled schema
    for (const validate of validators) {
      validate(parameters);
      if (validate.errors) {
        result.errors.push(...validate.errors);
      } else if (this.coerceTypes) {
        result.coerced.query = parameters.query;
        result.coerced.params = parameters.path;
      }
    }

    if (_.isEmpty(result.errors)) {
      // set empty errors array to null so we can check for result.errors truthiness
      result.errors = null;
    } else {
      // there were errors, set valid to false
      result.valid = false;
    }
    return result;
  }

  /**
   * Validates a response against a prebuilt Ajv validator and returns the result
   *
   * @param {*} res
   * @param {(Operation<D> | string)} operation
   * @package {number} [statusCode]
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateResponse(res: any, operation: Operation<D> | string, statusCode?: number): ValidationResult {
    const result: ValidationResult = { valid: true };
    result.errors = [];

    const op = typeof operation === 'string' ? this.router.getOperation(operation) : operation;
    if (!op || !op.operationId) {
      throw new Error(`Unknown operation`);
    }

    const { operationId } = op;

    let validate: ValidateFunction | null = null;
    if (statusCode) {
      // use specific status code
      const validateMap = this.getStatusBasedResponseValidatorForOperation(operationId);
      if (validateMap) {
        validate = OpenAPIUtils.findStatusCodeMatch(statusCode, validateMap);
      }
    } else {
      // match against all status codes
      validate = this.getResponseValidatorForOperation(operationId);
    }

    if (validate) {
      // perform validation against response
      validate(res);
      if (validate.errors) {
        result.errors.push(...validate.errors);
      }
    } else {
      // maybe we should warn about this? TODO: add option to enable / disable warnings
      // console.warn(`No validation matched for ${JSON.stringify({ operationId, statusCode })}`);
    }

    if (_.isEmpty(result.errors)) {
      // set empty errors array to null so we can check for result.errors truthiness
      result.errors = null;
    } else {
      // there were errors, set valid to false
      result.valid = false;
    }
    return result;
  }

  /**
   * Validates response headers against a prebuilt Ajv validator and returns the result
   *
   * @param {*} headers
   * @param {(Operation<D> | string)} operation
   * @param {number} [opts.statusCode]
   * @param {SetMatchType} [opts.setMatchType] - one of 'any', 'superset', 'subset', 'exact'
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateResponseHeaders(
    headers: any,
    operation: Operation<D> | string,
    opts?: {
      statusCode?: number;
      setMatchType?: SetMatchType;
    },
  ): ValidationResult {
    const result: ValidationResult = { valid: true };
    result.errors = [];

    const op = typeof operation === 'string' ? this.router.getOperation(operation) : operation;
    if (!op || !op.operationId) {
      throw new Error(`Unknown operation`);
    }

    let setMatchType = opts && opts.setMatchType;
    const statusCode = opts && opts.statusCode;

    if (!setMatchType) {
      setMatchType = SetMatchType.Any;
    } else if (!_.includes(Object.values(SetMatchType), setMatchType)) {
      throw new Error(`Unknown setMatchType ${setMatchType}`);
    }

    const { operationId } = op;
    const validateMap = this.getResponseHeadersValidatorForOperation(operationId);

    if (validateMap) {
      let validateForStatus: { [setMatchType: string]: ValidateFunction };
      if (statusCode) {
        validateForStatus = OpenAPIUtils.findStatusCodeMatch(statusCode, validateMap);
      } else {
        validateForStatus = OpenAPIUtils.findDefaultStatusCodeMatch(validateMap).res;
      }

      if (validateForStatus) {
        const validate = validateForStatus[setMatchType];

        if (validate) {
          headers = _.mapKeys(
            headers,
            (value: PickVersionElement<D, OpenAPIV3.HeaderObject, OpenAPIV3_1.HeaderObject>, headerName: string) =>
              headerName.toLowerCase(),
          );
          validate({ headers });
          if (validate.errors) {
            result.errors.push(...validate.errors);
          }
        }
      }
    }

    if (_.isEmpty(result.errors)) {
      // set empty errors array to null so we can check for result.errors truthiness
      result.errors = null;
    } else {
      // there were errors, set valid to false
      result.valid = false;
    }
    return result;
  }

  /**
   * Get an array of request validator functions for an operation by operationId
   *
   * @param {string} operationId
   * @returns {*}  {(ValidateFunction[] | null)}
   * @memberof OpenAPIValidator
   */
  public getRequestValidatorsForOperation(operationId: string) {
    if (this.requestValidators[operationId] === undefined) {
      const operation = this.router.getOperation(operationId) as Operation<D>;
      this.requestValidators[operationId] = this.buildRequestValidatorsForOperation(operation);
    }
    return this.requestValidators[operationId];
  }

  /**
   * Compiles a schema with Ajv instance and handles circular references.
   *
   * @param ajv The Ajv instance
   * @param schema The schema to compile
   */
  private static compileSchema(ajv: Ajv, schema: any): ValidateFunction {
    const decycledSchema = this.decycle(schema);
    return ajv.compile(decycledSchema);
  }

  /**
   * Produces a deep clone which replaces object reference cycles with JSONSchema refs.
   * This function is based on [cycle.js]{@link https://github.com/douglascrockford/JSON-js/blob/master/cycle.js}, which was referred by
   * the [MDN]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value}.
   * @param object An object for which to remove cycles
   */
  private static decycle(object: any): any {
    const objects = new WeakMap(); // object to path mappings
    return (function derez(value, path) {
      // The derez function recurses through the object, producing the deep copy.

      let oldPath; // The path of an earlier occurance of value
      let nu: any; // The new object or array

      // typeof null === "object", so go on if this value is really an object but not
      // one of the weird builtin objects.

      if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Boolean) &&
        !(value instanceof Date) &&
        !(value instanceof Number) &&
        !(value instanceof RegExp) &&
        !(value instanceof String)
      ) {
        // If the value is an object or array, look to see if we have already
        // encountered it. If so, return a {"$ref":PATH} object. This uses an
        // ES6 WeakMap.

        oldPath = objects.get(value);
        if (oldPath !== undefined) {
          return { $ref: oldPath };
        }

        // Otherwise, accumulate the unique value and its path.

        objects.set(value, path);

        // If it is an array, replicate the array.

        if (Array.isArray(value)) {
          nu = [];
          value.forEach((element, i) => {
            nu[i] = derez(element, path + '/' + i);
          });
        } else {
          // If it is an object, replicate the object.
          nu = {};
          Object.keys(value).forEach((name) => {
            nu[name] = derez(value[name], path + '/' + name);
          });
        }
        return nu;
      }
      return value;
    })(object, '#');
  }

  /**
   * Builds Ajv request validation functions for an operation and registers them to requestValidators
   *
   * @param {Operation<D>} operation
   * @returns {*}  {(ValidateFunction[] | null)}
   * @memberof OpenAPIValidator
   */
  public buildRequestValidatorsForOperation(operation: Operation<D>): ValidateFunction[] | null {
    if (!operation?.operationId) {
      // no operationId, don't register a validator
      return null;
    }

    // validator functions for this operation
    const validators: ValidateFunction[] = [];

    // schema for operation requestBody
    if (operation.requestBody) {
      const requestBody = operation.requestBody as PickVersionElement<
        D,
        OpenAPIV3.RequestBodyObject,
        OpenAPIV3_1.RequestBodyObject
      >;
      const jsonbody = requestBody.content['application/json'];
      if (jsonbody && jsonbody.schema) {
        const requestBodySchema: InputValidationSchema = {
          title: 'Request',
          type: 'object',
          additionalProperties: true,
          properties: {
            requestBody: jsonbody.schema as PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>,
          },
        };
        requestBodySchema.required = [];
        if (_.keys(requestBody.content).length === 1) {
          // if application/json is the only specified format, it's required
          requestBodySchema.required.push('requestBody');
        }

        // add compiled params schema to schemas for this operation id
        const requestBodyValidator = this.getAjv(ValidationContext.RequestBody);
        validators.push(OpenAPIValidator.compileSchema(requestBodyValidator, requestBodySchema));
      }
    }

    // schema for operation parameters in: path,query,header,cookie
    const paramsSchema: InputValidationSchema = {
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
    if (parameters) {
      parameters.map((parameter) => {
        const param = parameter as PickVersionElement<D, OpenAPIV3.ParameterObject, OpenAPIV3_1.ParameterObject>;
        const target = paramsSchema.properties[param.in];
        // Header params are case-insensitive according to https://tools.ietf.org/html/rfc7230#page-22, so they are
        // normalized to lower case and validated as such.
        const normalizedParamName = param.in === 'header' ? param.name.toLowerCase() : param.name;
        if (param.required) {
          target.required = target.required || [];
          target.required = _.uniq([...target.required, normalizedParamName]);
          paramsSchema.required = _.uniq([...(paramsSchema.required as string[]), param.in]);
        }
        target.properties = target.properties || {};

        const paramSchema = param.schema as
          | PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>
          | undefined;

        // Assign the target schema's additionalProperties to the param schema's additionalProperties if the param's additionalProperties is set.
        // This is to support free-form query params where `additionalProperties` is an object.
        // https://swagger.io/specification/?sbsearch=free%20form
        if (paramSchema && paramSchema?.additionalProperties !== undefined) {
          target.additionalProperties = paramSchema.additionalProperties;
        }

        if (param.content && param.content['application/json']) {
          target.properties[normalizedParamName] = param.content['application/json'].schema as PickVersionElement<
            D,
            OpenAPIV3.SchemaObject,
            OpenAPIV3_1.SchemaObject
          >;
        } else {
          target.properties[normalizedParamName] = param.schema as PickVersionElement<
            D,
            OpenAPIV3.SchemaObject,
            OpenAPIV3_1.SchemaObject
          >;
        }
      });
    }

    // add compiled params schema to requestValidators for this operation id
    const paramsValidator = this.getAjv(ValidationContext.Params, { coerceTypes: true });
    validators.push(OpenAPIValidator.compileSchema(paramsValidator, paramsSchema));
    return validators;
  }

  /**
   * Get response validator function for an operation by operationId
   *
   * @param {string} operationId
   * @returns {*}  {(ValidateFunction | null)}
   * @memberof OpenAPIValidator
   */
  public getResponseValidatorForOperation(operationId: string) {
    if (this.responseValidators[operationId] === undefined) {
      const operation = this.router.getOperation(operationId) as Operation<D>;
      this.responseValidators[operationId] = this.buildResponseValidatorForOperation(operation);
    }
    return this.responseValidators[operationId];
  }

  /**
   * Builds an ajv response validator function for an operation and registers it to responseValidators
   *
   * @param {Operation<D>} operation
   * @returns {*}  {(ValidateFunction | null)}
   * @memberof OpenAPIValidator
   */
  public buildResponseValidatorForOperation(operation: Operation<D>): ValidateFunction | null {
    if (!operation || !operation.operationId) {
      // no operationId, don't register a validator
      return null;
    }
    if (!operation.responses) {
      // operation has no responses, don't register a validator
      return null;
    }

    const responseSchemas: PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>[] = [];

    _.mapKeys(operation.responses, (res, _status) => {
      const response = res as PickVersionElement<D, OpenAPIV3.ResponseObject, OpenAPIV3_1.ResponseObject>;
      if (response.content && response.content['application/json'] && response.content['application/json'].schema) {
        responseSchemas.push(
          response.content['application/json'].schema as PickVersionElement<
            D,
            OpenAPIV3.SchemaObject,
            OpenAPIV3_1.SchemaObject
          >,
        );
      }
      return null;
    });

    if (_.isEmpty(responseSchemas)) {
      // operation has no response schemas, don't register a validator
      return null;
    }

    // compile the validator function and register to responseValidators
    const schema = { oneOf: responseSchemas };
    const responseValidator = this.getAjv(ValidationContext.Response);
    return OpenAPIValidator.compileSchema(responseValidator, schema);
  }

  /**
   * Get response validator function for an operation by operationId
   *
   * @param {string} operationId
   * @returns {*}  {(StatusBasedResponseValidatorsFunctionMap | null)}
   * @memberof OpenAPIRequestValidator
   */
  public getStatusBasedResponseValidatorForOperation(operationId: string) {
    if (this.statusBasedResponseValidators[operationId] === undefined) {
      const operation = this.router.getOperation(operationId) as Operation<D>;
      this.statusBasedResponseValidators[operationId] = this.buildStatusBasedResponseValidatorForOperation(operation);
    }
    return this.statusBasedResponseValidators[operationId];
  }

  /**
   * Builds an ajv response validator function for an operation and registers it to responseHeadersValidators
   *
   * @param {Operation<D>} operation
   * @returns {*}  {(StatusBasedResponseValidatorsFunctionMap | null)}
   * @memberof OpenAPIValidator
   */
  public buildStatusBasedResponseValidatorForOperation(
    operation: Operation<D>,
  ): StatusBasedResponseValidatorsFunctionMap | null {
    if (!operation || !operation.operationId) {
      // no operationId, don't register a validator
      return null;
    }
    if (!operation.responses) {
      // operation has no responses, don't register a validator
      return null;
    }
    const responseValidators: StatusBasedResponseValidatorsFunctionMap = {};
    const validator = this.getAjv(ValidationContext.Response);

    _.mapKeys(operation.responses, (res, status: string) => {
      const response = res as PickVersionElement<D, OpenAPIV3.ResponseObject, OpenAPIV3_1.ResponseObject>;
      if (response.content && response.content['application/json'] && response.content['application/json'].schema) {
        const validateFn = response.content['application/json'].schema;
        responseValidators[status] = OpenAPIValidator.compileSchema(validator, validateFn);
      }

      if (!response.content && status === '204') {
        const validateFn = {
          type: 'null',
          title: 'The root schema',
          description: 'The root schema comprises the entire JSON document.',
          default: null as null,
        };
        responseValidators[status] = OpenAPIValidator.compileSchema(validator, validateFn);
      }

      return null;
    });

    return responseValidators;
  }

  /**
   * Get response validator function for an operation by operationId
   *
   * @param {string} operationId
   * @returns {*}  {(ResponseHeadersValidateFunctionMap | null)}
   * @memberof OpenAPIRequestValidator
   */
  public getResponseHeadersValidatorForOperation(operationId: string) {
    if (this.responseHeadersValidators[operationId] === undefined) {
      const operation = this.router.getOperation(operationId) as Operation<D>;
      this.responseHeadersValidators[operationId] = this.buildResponseHeadersValidatorForOperation(operation);
    }
    return this.responseHeadersValidators[operationId];
  }

  /**
   * Builds an ajv response validator function for an operation and returns it
   *
   * @param {Operation<D>} operation
   * @returns {*}  {(ResponseHeadersValidateFunctionMap | null)}
   * @memberof OpenAPIValidator
   */
  public buildResponseHeadersValidatorForOperation(operation: Operation<D>): ResponseHeadersValidateFunctionMap | null {
    if (!operation || !operation.operationId) {
      // no operationId, don't register a validator
      return null;
    }
    if (!operation.responses) {
      // operation has no responses, don't register a validator
      return null;
    }

    const headerValidators: ResponseHeadersValidateFunctionMap = {};
    const validator = this.getAjv(ValidationContext.ResponseHeaders, { coerceTypes: true });

    _.mapKeys(operation.responses, (res, status: string) => {
      const response = res as PickVersionElement<D, OpenAPIV3.ResponseObject, OpenAPIV3_1.ResponseObject>;
      const validateFns: { [setMatchType: string]: ValidateFunction } = {};
      const properties: {
        [headerName: string]: PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>;
      } = {};
      const required: string[] = [];

      _.mapKeys(response.headers, (h, headerName: string) => {
        const header = h as PickVersionElement<D, OpenAPIV3.HeaderObject, OpenAPIV3_1.HeaderObject>;
        headerName = headerName.toLowerCase();
        if (header.schema) {
          properties[headerName] = header.schema as PickVersionElement<
            D,
            OpenAPIV3.SchemaObject,
            OpenAPIV3_1.SchemaObject
          >;
          required.push(headerName);
        }
        return null;
      });

      validateFns[SetMatchType.Any] = OpenAPIValidator.compileSchema(validator, {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            additionalProperties: true,
            properties,
            required: [],
          },
        },
      });

      validateFns[SetMatchType.Superset] = OpenAPIValidator.compileSchema(validator, {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            additionalProperties: true,
            properties,
            required,
          },
        },
      });

      validateFns[SetMatchType.Subset] = OpenAPIValidator.compileSchema(validator, {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            additionalProperties: false,
            properties,
            required: [],
          },
        },
      });

      validateFns[SetMatchType.Exact] = OpenAPIValidator.compileSchema(validator, {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            additionalProperties: false,
            properties,
            required,
          },
        },
      });

      headerValidators[status] = validateFns;
      return null;
    });

    return headerValidators;
  }

  /**
   * Get Ajv options
   *
   * @param {ValidationContext} validationContext
   * @param {AjvOpts} [opts={}]
   * @returns Ajv
   * @memberof OpenAPIValidator
   */
  public getAjv(validationContext: ValidationContext, opts: AjvOpts = {}) {
    const ajvOpts = { ...this.ajvOpts, ...opts };
    const ajv = new Ajv(ajvOpts);

    for (const [name, format] of Object.entries(defaultFormats)) {
      ajv.addFormat(name, format);
    }

    if (this.customizeAjv) {
      return this.customizeAjv(ajv, ajvOpts, validationContext);
    }
    return ajv;
  }
}
