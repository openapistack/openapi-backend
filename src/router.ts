import * as _ from 'lodash';
import { OpenAPIV3 } from 'openapi-types';
import bath from 'bath';
import * as cookie from 'cookie';
import { parse as parseQuery } from 'qs';
import { Parameters } from 'bath/_/types';

// alias Document to OpenAPIV3.Document
export type Document = OpenAPIV3.Document;

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
  securitySchemes: {[key: string]: OpenAPIV3.SecuritySchemeObject};
  operationId: string;
}

export interface Request {
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

export interface ParsedRequest extends Request {
  params?: {
    [key: string]: string | string[];
  };
  cookies?: {
    [key: string]: string | string[];
  };
  query?: {
    [key: string]: string | string[];
  };
  requestBody?: any;
}

/**
 * Class that handles routing
 *
 * @export
 * @class OpenAPIRouter
 */
export class OpenAPIRouter {
  public definition: Document;
  public apiRoot: string;

  /**
   * Creates an instance of OpenAPIRouter
   *
   * @param opts - constructor options
   * @param {Document} opts.definition - the OpenAPI definition, file path or Document object
   * @param {string} opts.apiRoot - the root URI of the api. all paths are matched relative to apiRoot
   * @memberof OpenAPIRouter
   */
  constructor(opts: { definition: Document; apiRoot?: string }) {
    this.definition = opts.definition;
    this.apiRoot = opts.apiRoot || '/';
  }

  /**
   * Matches a request to an API operation (router)
   *
   * @param {Request} req
   * @returns {Operation}
   * @memberof OpenAPIRouter
   */
  public matchOperation(req: Request): Operation | undefined {
    // normalize request for matching
    req = this.normalizeRequest(req);

    // get relative path
    const normalizedPath = this.normalizePath(req.path);

    // get all operations matching request method in a flat array
    const operations = _.filter(this.getOperations(), ({ method }) => method === req.method);

    // first check for an exact match for path
    const exactMatch = _.find(operations, ({ path }) => path === normalizedPath);
    if (exactMatch) {
      return exactMatch;
    }

    // then check for matches using path templating
    return _.find(operations, ({ path }) => {
      // convert openapi path template to a regex pattern i.e. /{id}/ becomes /[^/]+/
      const pathPattern = `^${path.replace(/\{.*?\}/g, '[^/]+')}$`;
      return Boolean(normalizedPath.match(new RegExp(pathPattern, 'g')));
    });
  }

  /**
   * Flattens operations into a simple array of Operation objects easy to work with
   *
   * @returns {Operation[]}
   * @memberof OpenAPIRouter
   */
  public getOperations(): Operation[] {
    const paths = _.get(this.definition, 'paths', {});

    // get security schemes definitions from components definition
    const securitySchemes = _.get(this.definition, 'components.securitySchemes', {}) as {[key: string]: OpenAPIV3.SecuritySchemeObject};

    // gets the list of the names of security schemes applied globally (on all paths)
    const globalSecurity = _.flatten(_.map(_.get(this.definition, 'security', []) as Array<OpenAPIV3.SecurityRequirementObject>, _.keys)) as Array<string>;

    // turns the name array into an object, with this structure:  {<securitySchemeName>: {<security scheme properties>} }
    const globallyAppliedSecurity = [] as {[key: string]: OpenAPIV3.SecuritySchemeObject};
    _.forEach(globalSecurity, (k: string) => {
        globallyAppliedSecurity[k] = securitySchemes[k];
    });

    return _.chain(paths)
      .entries()
      .flatMap(([path, pathBaseObject]: [string, OpenAPIV3.PathItemObject]) => {
        const methods = _.pick(pathBaseObject, ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
        return _.entries(methods).map(([method, operation]: [string, OpenAPIV3.OperationObject]) => {
          const op = operation;

          // gets the list of the names of security schemes applied locally (only to the current path)
          const localSecurity = _.flatten(_.map(_.get(op, 'security', []), _.keys)) as Array<string>;

          // forms an object array with all global and local security objects (if for some reason a security scheme appears both locally and globally, it only gets added to the array once.)
          const security = globallyAppliedSecurity as {[key: string]: OpenAPIV3.SecuritySchemeObject};
          _.forEach(localSecurity, (k: string) => {
              security[k] = securitySchemes[k];
          });

          return {
            ...op,
            path,
            method,
            // add the array of security objects to the operation object
            securitySchemes: security,
            // add the path base object's operations to the operation's parameters
            parameters: [
              ...((op.parameters as OpenAPIV3.ParameterObject[]) || []),
              ...((pathBaseObject.parameters as OpenAPIV3.ParameterObject[]) || []),
            ],
          };
        });
      })
      .value();
  }

  /**
   * Gets a single operation based on operationId
   *
   * @param {string} operationId
   * @returns {Operation}
   * @memberof OpenAPIRouter
   */
  public getOperation(operationId: string): Operation | undefined {
    return _.find(this.getOperations(), { operationId });
  }

  /**
   * Normalises request:
   * - http method to lowercase
   * - path leading slash 👍
   * - path trailing slash 👎
   * - path query string 👎
   *
   * @export
   * @param {Request} req
   * @returns {Request}
   */
  public normalizeRequest(req: Request): Request {
    return {
      ...req,
      path: (req.path || '')
        .trim()
        .split('?')[0] // remove query string
        .replace(/\/+$/, '') // remove trailing slash
        .replace(/^\/*/, '/'), // add leading slash
      method: req.method.trim().toLowerCase(),
    };
  }

  /**
   * Normalises path for matching: strips apiRoot prefix from the path.
   *
   * @export
   * @param {string} path
   * @returns {string}
   */
  public normalizePath(path: string) {
    return path.replace(new RegExp(`^${this.apiRoot}/?`), '/');
  }

  /**
   * Parses request
   * - parse json body
   * - parse path params based on uri template
   * - parse query string
   * - parse cookies from headers
   *
   * @export
   * @param {Request} req
   * @param {string} [path]
   * @returns {ParsedRequest}
   */
  public parseRequest(req: Request, path?: string): ParsedRequest {
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

    // parse query string from req.path + req.query
    const query = typeof req.query === 'object' ? req.query : parseQuery(req.path.split('?')[1]);

    // header keys are converted to lowercase, so Content-Type becomes content-type
    const headers = _.mapKeys(req.headers, (val, header) => header.toLowerCase());

    // parse cookie from headers
    const cookieHeader = headers['cookie'];
    const cookies = cookie.parse(_.flatten([cookieHeader]).join('; '));

    // normalize
    req = this.normalizeRequest(req);

    let params: Parameters | undefined = {};
    if (path) {
      // get relative path
      const normalizedPath = this.normalizePath(req.path);

      // parse path params if path is given
      const pathParams = bath(path);
      params = pathParams.params(normalizedPath) || undefined;
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
