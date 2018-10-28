import Hapi from 'hapi';
import OpenAPIBackend from 'openapi-backend';
import { ErrorObject } from 'ajv';

const dummyHandler = (operationId: string) => async (req: Hapi.Request) => ({ operationId });

const notFoundHandler = async (req: Hapi.Request, h: Hapi.ResponseToolkit) =>
  h.response({ status: 404, error: 'Not found' }).code(404);

const validationFailHandler = async (errors: ErrorObject[], req: Hapi.Request, h: Hapi.ResponseToolkit) =>
  h.response({ status: 400, errors }).code(400);

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

export async function handler(req: Hapi.Request, h: Hapi.ResponseToolkit) {
  return api.handleRequest(
    {
      method: req.method,
      path: req.path,
      body: req.payload,
      query: req.query,
      headers: req.headers,
    },
    req,
    h,
  );
}
