import 'source-map-support/register';
import OpenAPIBackend from 'openapi-backend';
import express from 'express';
import morgan from 'morgan';

import { Request, Response } from 'express';
import { ErrorObject } from 'ajv';

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
    getPets: async (req: Request, res: Response) => res.status(200).json({ ok: true }),
    getPetById: async (req: Request, res: Response) => res.status(200).json({ ok: true }),
    notFound: async (req: Request, res: Response) => res.status(200).json({ err: 'not found' }),
    validationFail: async (err: ErrorObject[], req: Request, res: Response) => res.status(200).json({ err }),
  },
});

api.init();

// logging
app.use(morgan('combined'));

// use as express middleware
app.use((req, res) => api.handleRequest(req, req, res));

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
