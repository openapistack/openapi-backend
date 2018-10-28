import 'source-map-support/register';
import { Context, HttpRequest } from 'azure-functions-ts-essentials';
import OpenAPIBackend from 'openapi-backend';
import { ErrorObject } from 'ajv';

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

const validationFailHandler = async (errors: ErrorObject[], context: Context, req: HttpRequest) => ({
  status: 400,
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

export async function handler(context: Context, req: HttpRequest) {
  const { method, params, query, body, headers } = req;
  context.res = await api.handleRequest(
    {
      method,
      path: params.path,
      query,
      body,
      headers,
    },
    context,
    req,
  );
}
