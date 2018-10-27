import 'source-map-support/register';
import { APIGatewayProxyEvent } from 'aws-lambda';
import OpenAPIBackend from 'openapi-backend';

const dummyHandler = (operationId: string) => async (event: APIGatewayProxyEvent) => ({
  statusCode: 200,
  body: JSON.stringify({ operationId }),
  headers: {
    'content-type': 'application/json',
  },
});

const notFoundHandler = async (event: APIGatewayProxyEvent) => ({
  statusCode: 404,
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

export async function handler(event: APIGatewayProxyEvent) {
  const { httpMethod: method, path, queryStringParameters: query, body, headers } = event;
  const apiRequest = { method, path, query, body, headers };
  return api.handleRequest(apiRequest, event);
}
