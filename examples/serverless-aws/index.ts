import 'source-map-support/register';
import * as Lambda from 'aws-lambda';
import OpenAPIBackend from 'openapi-backend';

// define api
const api = new OpenAPIBackend({
  definition: {
    openapi: '3.0.1',
    info: {
      title: 'My API',
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
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'integer',
            },
          },
        ],
      },
    },
  },
  handlers: {
    getPets: async (c, event: Lambda.APIGatewayProxyEvent, context: Lambda.Context) => ({
      statusCode: 200,
      body: JSON.stringify({ operationId: c.operation.operationId }),
      headers: {
        'content-type': 'application/json',
      },
    }),
    getPetById: async (c, event: Lambda.APIGatewayProxyEvent, context: Lambda.Context) => ({
      statusCode: 200,
      body: JSON.stringify({ operationId: c.operation.operationId }),
      headers: {
        'content-type': 'application/json',
      },
    }),
    notFound: async (c, event: Lambda.APIGatewayProxyEvent, context: Lambda.Context) => ({
      statusCode: 404,
      body: JSON.stringify({ err: 'not found' }),
      headers: {
        'content-type': 'application/json',
      },
    }),
    validationFail: async (c, event: Lambda.APIGatewayProxyEvent, context: Lambda.Context) => ({
      statusCode: 400,
      body: JSON.stringify({ err: c.validation.errors }),
      headers: {
        'content-type': 'application/json',
      },
    }),
  },
});

api.init();

export async function handler(event: Lambda.APIGatewayProxyEvent, context: Lambda.Context) {
  return api.handleRequest(
    {
      method: event.httpMethod,
      path: event.path,
      query: event.queryStringParameters,
      body: event.body,
      headers: event.headers,
    },
    event,
    context,
  );
}
