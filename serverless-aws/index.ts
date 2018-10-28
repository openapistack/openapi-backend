import 'source-map-support/register';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
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
    getPets: async (event: APIGatewayProxyEvent, context: Context) => ({
      statusCode: 200,
      body: JSON.stringify({ operationId: 'getPets' }),
      headers: {
        'content-type': 'application/json',
      },
    }),
    getPetById: async (event: APIGatewayProxyEvent, context: Context) => ({
      statusCode: 200,
      body: JSON.stringify({ operationId: 'getPetById' }),
      headers: {
        'content-type': 'application/json',
      },
    }),
    notFound: async (event: APIGatewayProxyEvent, context: Context) => ({
      statusCode: 404,
      body: JSON.stringify({ err: 'not found' }),
      headers: {
        'content-type': 'application/json',
      },
    }),
    validationFail: async (err, event: APIGatewayProxyEvent, context: Context) => ({
      statusCode: 400,
      body: JSON.stringify({ err }),
      headers: {
        'content-type': 'application/json',
      },
    }),
  },
});

api.init();

export async function handler(event: APIGatewayProxyEvent, context: Context) {
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
