import * as _ from 'lodash';
import type { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import bath from 'bath-es5';
import * as cookie from 'cookie';
import { parse as parseQuery } from 'qs';
import { Parameters } from 'bath-es5/_/types';
import { PickVersionElement } from './backend';
import Ajv from 'ajv';

// alias Document to OpenAPIV3_1.Document
type Document = OpenAPIV3_1.Document | OpenAPIV3.Document;

/**
 * OperationObject
 * @typedef {(OpenAPIV3_1.OperationObject | OpenAPIV3.OperationObject)} OperationObject
 */

/**
 * OAS Operation Object containing the path and method so it can be placed in a flat array of operations
 *
 * @export
 * @interface Operation
 * @extends {OperationObject}
 */
export type Operation<D extends Document = Document> = PickVersionElement<
  D,
  OpenAPIV3.OperationObject,
  OpenAPIV3_1.OperationObject
> & {
  path: string;
  method: string;
};

type ParamValue = string | number | boolean;

export interface Request {
  method: string;
  path: string;
  headers: {
    [key: string]: ParamValue | ParamValue[];
  };
  query?:
  | {
    [key: string]: ParamValue | ParamValue[];
  }
  | string;
  body?: any;
}

export interface ParsedRequest extends Request {
  params: {
    [key: string]: ParamValue | ParamValue[];
  };
  cookies: {
    [key: string]: ParamValue | ParamValue[];
  };
  query: {
    [key: string]: ParamValue | ParamValue[];
  };
  requestBody: any;
}

/**
 * Class that handles routing
 *
 * @export
 * @class OpenAPIRouter
 */
export class OpenAPIRouter<D extends Document = Document> {
  public definition: D;
  public apiRoot: string;

  private ignoreTrailingSlashes: boolean;

  /**
   * Creates an instance of OpenAPIRouter
   *
   * @param opts - constructor options
   * @param {D} opts.definition - the OpenAPI definition, file path or Document object
   * @param {string} opts.apiRoot - the root URI of the api. all paths are matched relative to apiRoot
   * @memberof OpenAPIRouter
   */
  constructor(opts: { definition: D; apiRoot?: string; ignoreTrailingSlashes?: boolean }) {
    this.definition = opts.definition;
    this.apiRoot = opts.apiRoot || '/';
    this.ignoreTrailingSlashes = opts.ignoreTrailingSlashes ?? true;
  }

  /**
   * Matches a request to an API operation (router)
   *
   * @param {Request} req
   * @param {boolean} [strict] strict mode, throw error if operation is not found
   * @returns {Operation<D>}
   * @memberof OpenAPIRouter
   */
  public matchOperation(req: Request): Operation<D> | undefined;
  public matchOperation(req: Request, strict: boolean): Operation<D>;
  public matchOperation(req: Request, strict?: boolean) {
    // normalize request for matching
    req = this.normalizeRequest(req);

    // if request doesn't match apiRoot, throw 404
    if (!req.path.startsWith(this.apiRoot)) {
      if (strict) {
        throw Error('404-notFound: no route matches request');
      } else {
        return undefined;
      }
    }

    // get relative path
    const normalizedPath = this.normalizePath(req.path);

    // get all operations matching exact path
    const exactPathMatches = _.filter(this.getOperations(), ({ path }) => path === normalizedPath);

    // check if there's one with correct method and return if found
    const exactMatch = _.find(exactPathMatches, ({ method }) => method === req.method);
    if (exactMatch) {
      return exactMatch;
    }

    // check with path templates
    const templatePathMatches = _.filter(this.getOperations(), ({ path }) => {
      // convert openapi path template to a regex pattern i.e. /{id}/ becomes /[^/]+/
      const pathPattern = `^${path.replace(/\{.*?\}/g, '[^/]+')}$`;
      return Boolean(normalizedPath.match(new RegExp(pathPattern, 'g')));
    });

    // if no operations match the path, throw 404
    if (!templatePathMatches.length) {
      if (strict) {
        throw Error('404-notFound: no route matches request');
      } else {
        return undefined;
      }
    }

    // find matching operation
    const match = _.chain(templatePathMatches)
      // order matches by length (specificity)
      .orderBy((op) => op.path.replace(RegExp(/\{.*?\}/g), '').length, 'desc')
      // then check if one of the matched operations matches the method
      .find(({ method }) => method === req.method)
      .value();

    if (!match) {
      if (strict) {
        throw Error('405-methodNotAllowed: this method is not registered for the route');
      } else {
        return undefined;
      }
    }

    return match;
  }

  /**
   * Flattens operations into a simple array of Operation objects easy to work with
   *
   * @returns {Operation<D>[]}
   * @memberof OpenAPIRouter
   */
  public getOperations(): Operation<D>[] {
    const paths = _.get(this.definition, 'paths', {});
    return _.chain(paths)
      .entries()
      .flatMap(([path, pathBaseObject]) => {
        const methods = _.pick(pathBaseObject, ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
        return _.entries(methods).map(([method, operation]) => {
          const op = operation as Operation<D>;
          return {
            ...op,
            path,
            method,
            // append the path base object's parameters to the operation's parameters
            parameters: [
              ...((op.parameters as PickVersionElement<D, OpenAPIV3.ParameterObject, OpenAPIV3_1.ParameterObject>[]) ||
                []),
              ...((pathBaseObject?.parameters as PickVersionElement<
                D,
                OpenAPIV3.ParameterObject,
                OpenAPIV3_1.ParameterObject
              >[]) || []), // path base object parameters
            ],
            // operation-specific security requirement override global requirements
            security: op.security || this.definition.security || [],
          };
        });
      })
      .value();
  }

  /**
   * Gets a single operation based on operationId
   *
   * @param {string} operationId
   * @returns {Operation<D>}
   * @memberof OpenAPIRouter
   */
  public getOperation(operationId: string): Operation<D> | undefined {
    return _.find(this.getOperations(), { operationId });
  }

  /**
   * Normalises request:
   * - http method to lowercase
   * - remove path leading slash
   * - remove path query string
   *
   * @export
   * @param {Request} req
   * @returns {Request}
   */
  public normalizeRequest(req: Request): Request {
    let path = req.path?.trim() || '';

    // add leading prefix to path
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }

    // remove query string from path
    path = path.split('?')[0];

    // normalize method to lowercase
    const method = req.method.trim().toLowerCase();

    return { ...req, path, method };
  }

  /**
   * Normalises path for matching: strips apiRoot prefix from the path
   *
   * Also depending on configuration, will remove trailing slashes
   *
   * @export
   * @param {string} path
   * @returns {string}
   */
  public normalizePath(pathInput: string) {
    let path = pathInput.trim();

    // strip apiRoot from path
    if (path.startsWith(this.apiRoot)) {
      path = path.replace(new RegExp(`^${this.apiRoot}/?`), '/');
    }

    // remove trailing slashes from path if ignoreTrailingSlashes = true
    while (this.ignoreTrailingSlashes && path.length > 1 && path.endsWith('/')) {
      path = path.substr(0, path.length - 1);
    }

    return path;
  }

  /**
   * Parses and normalizes a request
   * - parse json body
   * - parse query string
   * - parse cookies from headers
   * - parse path params based on uri template
   *
   * @export
   * @param {Request} req
   * @param {Operation<D>} [operation]
   * @param {string} [patbh]
   * @returns {ParsedRequest}
   */
  public parseRequest(req: Request, operation?: Operation<D>): ParsedRequest {
    let requestBody = req.body;
    if (req.body && typeof req.body !== 'object') {
      try {
        // attempt to parse json
        requestBody = JSON.parse(req.body.toString());
      } catch {
        // suppress json parsing errors
        // we will emit error if validation requires it later
      }
    }

    // header keys are converted to lowercase, so Content-Type becomes content-type
    const headers = _.mapKeys(req.headers, (val, header) => header.toLowerCase());

    // parse cookie from headers
    const cookieHeader = headers['cookie'];
    const cookies = cookie.parse(_.flatten([cookieHeader]).join('; '));

    // parse query
    const queryString = typeof req.query === 'string' ? req.query.replace('?', '') : req.path.split('?')[1];
    let query = typeof req.query === 'object' ? _.cloneDeep(req.query) : parseQuery(queryString);

    // normalize
    req = this.normalizeRequest(req);

    let params: Parameters = {};
    if (operation) {
      // get relative path
      const normalizedPath = this.normalizePath(req.path);

      // parse path params if path is given
      const pathParams = bath(operation.path);
      params = pathParams.params(normalizedPath) || {};
      // parse query parameters with specified style for parameter

      /**
       * Coerce the input parameters to be the correct type (if specified, otherwise it defaults to a string).
       * @param inputObj The object with input parameters to coerce.
       * @param location If the parameter is in the `path` or `query`
       */
      const coerceInputs = (inputObj: any, location: 'query' | 'path') => {
        let coerced: any = _.cloneDeep(inputObj);
        for (const queryParam in coerced) {
          if (coerced[queryParam]) {
            const parameter = _.find(
              (operation.parameters as PickVersionElement<D, OpenAPIV3.ParameterObject, OpenAPIV3_1.ParameterObject>[]) || [],
              {
                name: queryParam,
                in: location,
              },
            );
            if (parameter) {
              if (parameter.content && parameter.content['application/json']) {
                // JSON.parse handles parsing to correct data types, no additional logic necessary.
                coerced[queryParam] = JSON.parse(coerced[queryParam]);
              } else if (parameter.explode === false && queryString) {
                let commaQueryString = queryString;
                if (parameter.style === 'spaceDelimited') {
                  commaQueryString = commaQueryString.replace(/\ /g, ',').replace(/\%20/g, ',');
                }
                if (parameter.style === 'pipeDelimited') {
                  commaQueryString = commaQueryString.replace(/\|/g, ',').replace(/\%7C/g, ',');
                }
                // use comma parsing e.g. &a=1,2,3
                const commaParsed = parseQuery(commaQueryString, { comma: true });
                coerced[queryParam] = commaParsed[queryParam];
              }
              // If a schema is specified use Ajv type coercion.
              if (parameter.schema) {
                const ajv = new Ajv({ coerceTypes: 'array' });
                /**
                 * The full representation of the desired schema.
                 * This allows for short-hand inputs of types like `type: integer`
                 * then we expand it here so Ajv parses it correctly, otherwise we'll get an error.
                 */
                let parseSchema: PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>
                let queryData = coerced[queryParam];
                const isArray = Array.isArray(queryData);
                /** The specified schema type. */
                const specifiedSchemaType = (parameter.schema as PickVersionElement<D, OpenAPIV3.SchemaObject, OpenAPIV3_1.SchemaObject>)?.type;
                // Even if the input is an array but not defined as an array still parse it as an array anyway.
                if (isArray && specifiedSchemaType !== 'array') {
                  parseSchema = {
                    type: 'array',
                    items: {
                      ...parameter.schema
                    }
                  }
                } else {
                  // Expand short-hand to full schema.
                  parseSchema = {
                    type: 'object',
                    properties: {
                      [queryParam]: parameter.schema
                    }
                  }
                  queryData = { [queryParam]: coerced[queryParam] }
                }
                const coerceData = ajv.compile(parseSchema);
                // Set `queryData` to the type coerced value(s).
                coerceData(queryData);
                if (isArray && specifiedSchemaType !== 'array') {
                  // Set the query array to the type-coerced array.
                  coerced[queryParam] = queryData;
                } else {
                  // Set the query to the type-coerced value.
                  coerced[queryParam] = queryData[queryParam];
                }
              }
            }
          }
        }
        return coerced;
      }

      // Coerce the inputs to be the correct type and overwrite the request with the correct values.
      params = coerceInputs(params, 'path');
      query = coerceInputs(query, 'query');

    }

    return {
      ...req,
      params,
      headers,
      query,
      cookies,
      requestBody,
    };
  }
}
