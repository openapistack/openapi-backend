import { parse as parseQuery } from 'query-string';
import _ from 'lodash';

export interface RequestObject {
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

// normalises request
// - http method is lowercase
// - path leading slash 👍
// - path trailing slash 👎
// - path query string 👎
export function normalizeRequest(req: RequestObject): RequestObject {
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

export interface ParsedRequestObject extends RequestObject {
  params?: {
    [key: string]: string | string[];
  };
  cookies?: {
    [key: string]: string | string[];
  };
  requestBody?: any;
}

// parses request
// - parse json body
// - parse path params based on uri template
// - parse query string
// - parse cookies from headers
export function parseRequest(req: RequestObject, path?: string): ParsedRequestObject {
  let requestBody = typeof req.body === 'object' ? req.body : null;
  try {
    requestBody = JSON.parse(req.body.toString());
  } catch {
    // suppress json parsing errors
  }

  // parse query string from req.path + req.query
  const query = typeof req.query === 'object' ? req.query : parseQuery(req.path.split('?')[1]);

  // @TODO: parse cookie from headers
  const cookies = {};

  // normalize
  req = normalizeRequest(req);

  // parse path
  const paramPlaceholder = '{[^\\/]*}';
  const pathPattern = `^${path.replace(new RegExp(paramPlaceholder, 'g'), '([^\\/]*)').replace(/\//g, '\\/')}$`;
  const paramValueArray = new RegExp(pathPattern).exec(req.path).splice(1);
  const paramNameArray = (path.match(new RegExp(paramPlaceholder, 'g')) || []).map((param) =>
    param.replace(/[{}]/g, ''),
  );
  const params = _.zipObject(paramNameArray, paramValueArray);

  return {
    ...req,
    params,
    query,
    cookies,
    requestBody,
  };
}
