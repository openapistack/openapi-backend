import 'source-map-support/register';
import { Context, HttpRequest } from 'azure-functions-ts-essentials';
import OpenAPIBackend from 'openapi-backend';

const dummyHandler = (operationId: string) => async (context: Context, req: HttpRequest) => ({
  status: 200,
  body: JSON.stringify({ operationId }),
  headers: {
    'content-type': 'application/json',
  },
});

const notFoundHandler = async (context: Context, req: HttpRequest) => ({
  status: 404,
  body: JSON.stringify({ status: 404, error: 'Not found' }),
  headers: {
    'content-type': 'application/json',
  },
});

const api = new OpenAPIBackend({
  document: {
    openapi: '3.0.0',
    info: {
      title: 'api',
      version: '1.0.0',
    },
    paths: {
      '/pets': {
        get: {
          operationId: 'getPets',
          responses: {
            200: { description: 'ok' },
          },
        },
      },
      '/pets/{id}': {
        get: {
          operationId: 'getPetById',
          responses: {
            200: { description: 'ok' },
          },
        },
      },
    },
  },
  handlers: {
    getPets: dummyHandler('getPets'),
    getPetById: dummyHandler('getPetById'),
    notFound: notFoundHandler,
  },
});

export async function handler(context: Context, req: HttpRequest) {
  const { method, params, query, body, headers } = req;
  const apiRequest = { method, path: params.path, query, body, headers };
  context.res = await api.handleRequest(apiRequest, context, req);
}
