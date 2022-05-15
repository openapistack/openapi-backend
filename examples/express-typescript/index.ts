import 'source-map-support/register';
import OpenAPIBackend from 'openapi-backend';
import Express from 'express';
import morgan from 'morgan';

import type { Request } from 'openapi-backend';

const app = Express();
app.use(Express.json());

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
    getPets: async (c, req: Express.Request, res: Express.Response) =>
      res.status(200).json({ operationId: c.operation.operationId }),
    getPetById: async (c, req: Express.Request, res: Express.Response) =>
      res.status(200).json({ operationId: c.operation.operationId }),
    validationFail: async (c, req: Express.Request, res: Express.Response) =>
      res.status(400).json({ err: c.validation.errors }),
    notFound: async (c, req: Express.Request, res: Express.Response) => res.status(404).json({ err: 'not found' }),
  },
});

api.init();

// logging
app.use(morgan('combined'));

// use as express middleware
app.use((req, res) => api.handleRequest(req as Request, req, res));

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
