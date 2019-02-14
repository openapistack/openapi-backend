import _ from 'lodash';
import Ajv from 'ajv';
import { OpenAPIV3 } from 'openapi-types';
import { OpenAPIRouter, Request, Operation } from './router';
import OpenAPIUtils from './utils';
import { SetMatchType } from './backend';

// alias Document to OpenAPIV3.Document
type Document = OpenAPIV3.Document;

/**
 * The output object for validationRequest. Contains the results for validation
 *
 * @export
 * @interface ValidationStatus
 */
export interface ValidationResult {
  valid: boolean;
  errors?: Ajv.ErrorObject[];
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

interface ResponseHeadersValidateFunctionMap {
  [statusCode: string]: { [setMatchType: string]: Ajv.ValidateFunction };
}

interface StatusBasedResponseValidatorsFunctionMap {
  [statusCode: string]: Ajv.ValidateFunction;
}

interface ResponseValidatorsFunctionMap {
  [operationId: string]: StatusBasedResponseValidatorsFunctionMap;
}

/**
 * Class that handles JSON schema validation
 *
 * @export
 * @class OpenAPIValidator
 */
export class OpenAPIValidator {
  public definition: Document;
  public ajvOpts: Ajv.Options;
  public requestValidators: { [operationId: string]: Ajv.ValidateFunction[] };
  public responseValidators: { [operationId: string]: Ajv.ValidateFunction };
  public statusBasedResponseValidators: ResponseValidatorsFunctionMap;

  public responseHeadersValidators: { [operationId: string]: ResponseHeadersValidateFunctionMap };

  public router: OpenAPIRouter;

  /**
   * Creates an instance of OpenAPIValidation
   *
   * @param opts - constructor options
   * @param {Document | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {boolean} opts.ajvOpts - default ajv constructor opts (default: { unknownFormats: 'ignore' })
   * @param {OpenAPIRouter} opts.router - passed instance of OpenAPIRouter. Will create own child if no passed
   * @memberof OpenAPIRequestValidator
   */
  constructor(opts: { definition: Document; ajvOpts?: Ajv.Options; router?: OpenAPIRouter }) {
    this.definition = opts.definition;
    this.ajvOpts = {
      unknownFormats: 'ignore', // Ajv default behaviour is to throw an error when encountering an unknown format
      ...(opts.ajvOpts || {}),
    };

    // initalize router
    this.router = opts.router || new OpenAPIRouter({ definition: this.definition });

    // get defined api operations
    const operations = this.router.getOperations();

    // build request validation schemas for api operations
    this.requestValidators = {};
    operations.map(this.buildRequestValidatorsForOperation.bind(this));

    // build response validation schemas for api operations
    this.responseValidators = {};
    operations.map(this.buildResponseValidatorForOperation.bind(this));

    // build response validation schemas for api operations, per status code
    this.statusBasedResponseValidators = {};
    operations.map(this.buildStatusBasedResponseValidatorForOperation.bind(this));

    // build response header validation schemas for api operations
    this.responseHeadersValidators = {};
    operations.map(this.buildResponseHeadersValidatorForOperation.bind(this));
  }

  /**
   * Validates a request against prebuilt Ajv validators and returns the validation result.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to
   * validate it.
   *
   * @param {Request} req - request to validate
   * @param {(Operation | string)} operation - operation to validate against
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateRequest(req: Request, operation?: Operation | string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

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
    const validators = this.getRequestValidatorsForOperation(operationId);

    // build a parameter object to validate
    const { params, query, headers, cookies, requestBody } = this.router.parseRequest(req, operation.path);

    // convert singular query parameters to arrays if specified as array in operation parametes
    for (const [name, value] of _.entries(query)) {
      if (typeof value === 'string') {
        const operationParameter = _.find(operation.parameters, { name, in: 'query' });
        if (operationParameter) {
          const { schema } = operationParameter as OpenAPIV3.ParameterObject;
          if (schema && (schema as OpenAPIV3.SchemaObject).type === 'array') {
            query[name] = [value];
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
          result.errors.push({
            keyword: 'parse',
            dataPath: '',
            schemaPath: '#/requestBody',
            params: [],
            message: err.message,
          });
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
   * @param {(Operation | string)} [operation]
   * @package {number} [statusCode]
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateResponse(res: any, operation: Operation | string, statusCode?: number): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    if (typeof operation === 'string') {
      operation = this.router.getOperation(operation);
    }

    if (!operation || !operation.operationId) {
      throw new Error(`Unknown operation`);
    }

    const { operationId } = operation;

    let validate: Ajv.ValidateFunction;
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
   * @param {(Operation | string)} [operation]
   * @param {number} [opts.statusCode]
   * @param {SetMatchType} [opts.setMatchType] - one of 'any', 'superset', 'subset', 'exact'
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateResponseHeaders(
    headers: any,
    operation: Operation | string,
    opts?: {
      statusCode?: number;
      setMatchType?: SetMatchType;
    },
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    if (typeof operation === 'string') {
      operation = this.router.getOperation(operation);
    }

    if (!operation || !operation.operationId) {
      throw new Error(`Unknown operation`);
    }

    let setMatchType = opts && opts.setMatchType;
    const statusCode = opts && opts.statusCode;

    if (!setMatchType) {
      setMatchType = SetMatchType.Any;
    } else if (!_.includes(Object.values(SetMatchType), setMatchType)) {
      throw new Error(`Unknown setMatchType ${setMatchType}`);
    }

    const { operationId } = operation;
    const validateMap: ResponseHeadersValidateFunctionMap = this.getResponseHeadersValidatorForOperation(operationId);

    if (validateMap) {
      let validateForStatus: { [setMatchType: string]: Ajv.ValidateFunction };
      if (statusCode) {
        validateForStatus = OpenAPIUtils.findStatusCodeMatch(statusCode, validateMap);
      } else {
        validateForStatus = OpenAPIUtils.findDefaultStatusCodeMatch(validateMap).res;
      }

      if (validateForStatus) {
        const validate = validateForStatus[setMatchType];

        if (validate) {
          headers = _.mapKeys(headers, (value: OpenAPIV3.HeaderObject, headerName: string) => headerName.toLowerCase());
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
   * @returns {Ajv.ValidateFunction[]}
   * @memberof OpenAPIRequestValidator
   */
  public getRequestValidatorsForOperation(operationId: string) {
    return this.requestValidators[operationId];
  }

  /**
   * Builds Ajv request validation functions for an operation and registers them to requestValidators
   *
   * @param {Operation} operation
   * @memberof OpenAPIRequestValidator
   */
  public buildRequestValidatorsForOperation(operation: Operation): void {
    const { operationId } = operation;

    // validator functions for this operation
    const validators: Ajv.ValidateFunction[] = [];

    // schema for operation requestBody
    if (operation.requestBody) {
      const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
      const jsonbody = requestBody.content['application/json'];
      if (jsonbody && jsonbody.schema) {
        const requestBodySchema: InputValidationSchema = {
          title: 'Request',
          type: 'object',
          additionalProperties: true,
          properties: {
            requestBody: jsonbody.schema as OpenAPIV3.SchemaObject,
          },
          required: [],
        };
        if (_.keys(requestBody.content).length === 1) {
          // if application/json is the only specified format, it's required
          requestBodySchema.required.push('requestBody');
        }

        // add compiled params schema to schemas for this operation id
        const requstBodyValidator = new Ajv(this.ajvOpts);
        validators.push(requstBodyValidator.compile(requestBodySchema));
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
    parameters.map((param: OpenAPIV3.ParameterObject) => {
      const target = paramsSchema.properties[param.in];
      // Header params are case-insensitive according to https://tools.ietf.org/html/rfc7230#page-22, so they are
      // normalized to lower case and validated as such.
      const normalizedParamName = param.in === 'header' ? param.name.toLowerCase() : param.name;
      if (param.required) {
        target.required.push(normalizedParamName);
        paramsSchema.required = _.uniq([...paramsSchema.required, param.in]);
      }
      target.properties[normalizedParamName] = param.schema as OpenAPIV3.SchemaObject;
    });

    // add compiled params schema to requestValidators for this operation id
    const paramsValidator = new Ajv({ ...this.ajvOpts, coerceTypes: true }); // types should be coerced for params
    validators.push(paramsValidator.compile(paramsSchema));
    this.requestValidators[operationId] = validators;
  }

  /**
   * Get response validator function for an operation by operationId
   *
   * @param {string} operationId
   * @returns {Ajv.ValidateFunction}
   * @memberof OpenAPIRequestValidator
   */
  public getResponseValidatorForOperation(operationId: string) {
    return this.responseValidators[operationId];
  }

  /**
   * Builds an ajv response validator function for an operation and registers it to responseValidators
   *
   * @param {Operation} operation
   * @memberof OpenAPIRequestValidator
   */
  public buildResponseValidatorForOperation(operation: Operation): void {
    if (!operation.responses) {
      // operation has no responses, don't register a validator
      return null;
    }

    const { operationId } = operation;
    const responseSchemas: OpenAPIV3.SchemaObject[] = [];

    _.mapKeys(operation.responses, (response: OpenAPIV3.ResponseObject, status) => {
      if (response.content && response.content['application/json'] && response.content['application/json'].schema) {
        responseSchemas.push(response.content['application/json'].schema as OpenAPIV3.SchemaObject);
      }
      return null;
    });

    if (_.isEmpty(responseSchemas)) {
      // operation has no response schemas, don't register a validator
      return null;
    }

    // compile the validator function and register to responseValidators
    const schema = { oneOf: responseSchemas };
    const validator = new Ajv(this.ajvOpts);
    this.responseValidators[operationId] = validator.compile(schema);
  }

  /**
   * Get response validator function for an operation by operationId
   *
   * @param {string} operationId
   * @returns {Object.<Ajv.ValidateFunction>}}
   * @memberof OpenAPIRequestValidator
   */
  public getStatusBasedResponseValidatorForOperation(operationId: string): StatusBasedResponseValidatorsFunctionMap {
    return this.statusBasedResponseValidators[operationId];
  }

  /**
   * Builds an ajv response validator function for an operation and registers it to responseHeadersValidators
   *
   * @param {Operation} operation
   * @memberof OpenAPIRequestValidator
   */
  public buildStatusBasedResponseValidatorForOperation(operation: Operation): void {
    if (!operation.responses) {
      // operation has no responses, don't register a validator
      return null;
    }

    const { operationId } = operation;
    const responseValidators: StatusBasedResponseValidatorsFunctionMap = {};
    const validator = new Ajv(this.ajvOpts);

    _.mapKeys(operation.responses, (response: OpenAPIV3.ResponseObject, status: string) => {
      if (response.content && response.content['application/json'] && response.content['application/json'].schema) {
        const validateFn = response.content['application/json'].schema;
        responseValidators[status] = validator.compile(validateFn);
      }
      return null;
    });

    this.statusBasedResponseValidators[operationId] = responseValidators;
  }

  /**
   * Get response validator function for an operation by operationId
   *
   * @param {string} operationId
   * @returns {Object.<Object.<Ajv.ValidateFunction>>}}
   * @memberof OpenAPIRequestValidator
   */
  public getResponseHeadersValidatorForOperation(operationId: string): ResponseHeadersValidateFunctionMap {
    return this.responseHeadersValidators[operationId];
  }

  /**
   * Builds an ajv response validator function for an operation and registers it to responseHeadersValidators
   *
   * @param {Operation} operation
   * @memberof OpenAPIRequestValidator
   */
  public buildResponseHeadersValidatorForOperation(operation: Operation): void {
    if (!operation.responses) {
      // operation has no responses, don't register a validator
      return null;
    }

    const { operationId } = operation;
    const headerValidators: ResponseHeadersValidateFunctionMap = {};
    const validator = new Ajv({ ...this.ajvOpts, coerceTypes: true });

    _.mapKeys(operation.responses, (response: OpenAPIV3.ResponseObject, status: string) => {
      const validateFns: { [setMatchType: string]: Ajv.ValidateFunction } = {};
      const properties: { [headerName: string]: OpenAPIV3.SchemaObject } = {};
      const required: string[] = [];

      _.mapKeys(response.headers, (header: OpenAPIV3.HeaderObject, headerName: string) => {
        headerName = headerName.toLowerCase();
        if (header.schema) {
          properties[headerName] = header.schema as OpenAPIV3.SchemaObject;
          required.push(headerName);
        }
        return null;
      });

      validateFns[SetMatchType.Any] = validator.compile({
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

      validateFns[SetMatchType.Superset] = validator.compile({
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

      validateFns[SetMatchType.Subset] = validator.compile({
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

      validateFns[SetMatchType.Exact] = validator.compile({
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

    this.responseHeadersValidators[operationId] = headerValidators;
  }
}
