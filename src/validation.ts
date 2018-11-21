import _ from 'lodash';
import Ajv from 'ajv';
import { OpenAPIV3 } from 'openapi-types';
import { OpenAPIRouter, Request, Operation } from './router';

// alias Document to OpenAPIV3.Document
type Document = OpenAPIV3.Document;

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
  public ajvOpts: Ajv.Options = { coerceTypes: true };
  public schemas: { [operationId: string]: Ajv.ValidateFunction };
  public router: OpenAPIRouter;

  /**
   * Creates an instance of OpenAPIValidation
   *
   * @param opts - constructor options
   * @param {Document | string} opts.definition - the OpenAPI definition, file path or Document object
   * @param {{ [operationId: string]: Handler | ErrorHandler }} opts.handlers - Operation handlers to be registered
   * @memberof OpenAPIRequestValidator
   */
  constructor(opts: { definition: Document }) {
    this.definition = opts.definition;

    // initalize router
    this.router = new OpenAPIRouter({ definition: this.definition });

    // build schemas for api operations
    this.schemas = {};
    const operations = this.router.getOperations();
    operations.map(this.buildSchemaForOperation.bind(this));
  }

  /**
   * Validates a request with Ajv and returns the Ajv validator.
   *
   * The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to
   * validate it.
   *
   * @param {Request} req - request to validate
   * @returns {Ajv.ValidateFunction}
   * @memberof OpenAPIRequestValidator
   */
  public validateRequest(req: Request, operation?: Operation): Ajv.ValidateFunction {
    if (!operation) {
      operation = this.router.matchOperation(req);
    }
    const { operationId } = operation;

    // get pre-compiled ajv schema for operation
    const validate = this.schemas[operationId];

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
   * Builds an Ajv schema validation function for an operation and registers it
   *
   * @param {Operation} operation
   * @memberof OpenAPIRequestValidator
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
}
