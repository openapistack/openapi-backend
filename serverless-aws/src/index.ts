import 'source-map-support/register';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import OpenAPIBackend from 'openapi-backend';
import { ErrorObject } from 'ajv';

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

const validationFailHandler = async (errors: ErrorObject[], event: APIGatewayProxyEvent) => ({
  statusCode: 400,
  body: JSON.stringify({ status: 400, errors }),
  headers: {
    'content-type': 'application/json',
  },
});

const api = new OpenAPIBackend({
  definition: {
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
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                $ref: '#/components/schemas/PetId',
              },
            },
          ],
          responses: {
            200: { description: 'ok' },
          },
        },
      },
    },
    components: {
      schemas: {
        PetId: {
          title: 'PetId',
          type: 'integer',
          example: 1,
        },
      },
    },
  },
  handlers: {
    getPets: dummyHandler('getPets'),
    getPetById: dummyHandler('getPetById'),
    notFound: notFoundHandler,
    validationFail: validationFailHandler,
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
