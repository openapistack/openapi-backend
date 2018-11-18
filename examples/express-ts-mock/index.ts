import 'source-map-support/register';
import path from 'path';
import OpenAPIBackend from 'openapi-backend';
import express from 'express';
import morgan from 'morgan';

import { Request, Response } from 'express';

const app = express();

// define api
const api = new OpenAPIBackend({
  definition: path.join(__dirname, '..', 'openapi.yml'),
  handlers: {
    validationFail: async (c, req: Request, res: Response) => res.status(400).json({ err: c.validation.errors }),
    notFound: async (c, req: Request, res: Response) => res.status(404).json({ err: 'not found' }),
  },
});

// mock response handler
api.registerHandler('notImplemented', async (c, req: Request, res: Response) => {
  const { status, mock } = api.mockResponseForOperation(c.operation.operationId);
  return res.status(status).json(mock);
});

api.init();

// logging
app.use(morgan('combined'));

// use as express middleware
app.use(express.json());
app.use((req, res) => api.handleRequest(req, req, res));

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
