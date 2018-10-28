import { Request, Response } from 'express';
import OpenAPIBackend from 'openapi-backend';
import { ErrorObject } from 'ajv';

const dummyHandler = (operationId: string) => async (req: Request, res: Response) => {
  return res.status(200).json({ operationId });
};

const notFoundHandler = async (req: Request, res: Response) => {
  return res.status(404).json({ status: 404, error: 'Not found' });
};

const validationFailHandler = async (errors: ErrorObject[], req: Request, res: Response) => {
  return res.status(400).json({ status: 400, errors });
};

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

export async function handler(req: Request, res: Response) {
  api.handleRequest(req, req, res);
}
