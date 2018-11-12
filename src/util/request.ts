import { parse as parseQuery } from 'query-string';
import _ from 'lodash';
import cookie from 'cookie';

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
export function normalizeRequest(req: Request): Request {
  return {
    ...req,
    path: (req.path || '')
      .trim()
      .split('?')[0] // remove query string
      .replace(/^\/*/, '/') // add leading slash
      .replace(/\/+$/, ''), // remove trailing slash
    method: req.method.trim().toLowerCase(),
  };
}

export interface ParsedRequest extends Request {
  params?: {
    [key: string]: string | string[];
  };
  cookies?: {
    [key: string]: string | string[];
  };
  requestBody?: any;
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
export function parseRequest(req: Request, path?: string): ParsedRequest {
  let requestBody = req.body;
  if (typeof req.body !== 'object') {
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
  req = normalizeRequest(req);

  let params = {};
  if (path) {
    // parse path params if path is given
    const paramPlaceholder = '{[^\\/]*}';
    const pathPattern = `^${path.replace(new RegExp(paramPlaceholder, 'g'), '([^\\/]*)').replace(/\//g, '\\/')}$`;
    const paramValueArray = new RegExp(pathPattern).exec(req.path).splice(1);
    const paramNameArray = (path.match(new RegExp(paramPlaceholder, 'g')) || []).map((param) =>
      param.replace(/[{}]/g, ''),
    );
    params = _.zipObject(paramNameArray, paramValueArray);
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
