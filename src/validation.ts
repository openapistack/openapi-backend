import _ from 'lodash';
import Ajv from 'ajv';
import { OpenAPIV3 } from 'openapi-types';
import { OpenAPIRouter, Request, Operation } from './router';

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

/**
 * Class that handles request validation
 *
 * @export
 * @class OpenAPIRequestValidator
 */
export class OpenAPIRequestValidator {
  public definition: Document;
  public ajvOpts: Ajv.Options;
  public schemas: { [operationId: string]: Ajv.ValidateFunction[] };
  public router: OpenAPIRouter;

  /**
   * Creates an instance of OpenAPIValidation
   *
   * @param opts - constructor options
   * @param {Document | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {{ [operationId: string]: Handler | ErrorHandler }} opts.handlers - Operation handlers to be registered
   * @memberof OpenAPIRequestValidator
   */
  constructor(opts: { definition: Document; ajvOpts?: Ajv.Options }) {
    this.definition = opts.definition;
    this.ajvOpts = opts.ajvOpts || {};

    // initalize router
    this.router = new OpenAPIRouter({ definition: this.definition });

    // build schemas for api operations
    this.schemas = {};
    const operations = this.router.getOperations();
    operations.map(this.buildSchemasForOperation.bind(this));
  }

  /**
   * Validates a request with Ajv and returns the Ajv validator.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to
   * validate it.
   *
   * @param {Request} req - request to validate
   * @returns {ValidationResult}
   * @memberof OpenAPIRequestValidator
   */
  public validateRequest(req: Request, operation?: Operation): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    if (!operation) {
      operation = this.router.matchOperation(req);
    }
    const { operationId } = operation;

    // get pre-compiled ajv schemas for operation
    const schemas = this.schemas[operationId];

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
    for (const validate of schemas) {
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
   * Builds an Ajv schema validation function for an operation and registers it
   *
   * @param {Operation} operation
   * @memberof OpenAPIRequestValidator
   */
  public buildSchemasForOperation(operation: Operation): void {
    const { operationId } = operation;

    // schemas for this operation
    const schemas: Ajv.ValidateFunction[] = [];

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
        schemas.push(requstBodyValidator.compile(requestBodySchema));
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
      if (param.required) {
        target.required.push(param.name);
        paramsSchema.required = _.uniq([...paramsSchema.required, param.in]);
      }
      target.properties[param.name] = param.schema as OpenAPIV3.SchemaObject;
    });

    // add compiled params schema to schemas for this operation id
    const paramsValidator = new Ajv({ ...this.ajvOpts, coerceTypes: true }); // types should be coerced for params
    schemas.push(paramsValidator.compile(paramsSchema));

    this.schemas[operationId] = schemas;
  }
}
