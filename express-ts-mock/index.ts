import 'source-map-support/register';
import OpenAPIBackend from 'openapi-backend';
import express from 'express';
import morgan from 'morgan';

import { Request, Response } from 'express';

const app = express();

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
            200: { $ref: '#/components/responses/ListPetsRes' },
          },
        },
      },
      '/pets/{id}': {
        get: {
          operationId: 'getPetById',
          responses: {
            200: { $ref: '#/components/responses/GetPetByIdRes' },
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
    components: {
      responses: {
        ListPetsRes: {
          description: 'ok',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'integer',
                      minimum: 1,
                    },
                    name: {
                      type: 'string',
                      example: 'Odie',
                    },
                  },
                },
              },
            },
          },
        },
        GetPetByIdRes: {
          description: 'ok',
          content: {
            'application/json': {
              examples: {
                garfield: {
                  value: {
                    id: 1,
                    name: 'Garfield',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  handlers: {
    validationFail: async (c, req: Request, res: Response) => res.status(400).json({ err: c.validation.errors }),
    notFound: async (c, req: Request, res: Response) => res.status(404).json({ err: 'not found' }),
  },
});

// mock response handler
api.registerHandler('notImplemented', async (c, req: Request, res: Response) => {
  const mock = api.mockResponseForOperation(c.operation.operationId);
  return res.status(200).json(mock);
});

api.init();

// logging
app.use(morgan('combined'));

// use as express middleware
app.use((req, res) => api.handleRequest(req, req, res));

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
