import path from 'node:path';
import express from 'express';
import { OpenAPIBackend } from 'openapi-backend';

const app = express();
app.use(express.json());

// define api
const api = new OpenAPIBackend({
  definition: path.join(import.meta.dirname, 'openapi.yml'),
  handlers: {
    getPets: async (c, req, res) => res.status(200).json({ operationId: c.operation.operationId }),
    getPetById: async (c, req, res) => res.status(200).json({ operationId: c.operation.operationId }),
    validationFail: async (c, req, res) => res.status(400).json({ err: c.validation.errors }),
    notFound: async (c, req, res) => res.status(404).json({ err: 'not found' }),
  },
});

// Lambda marks the environment ready once the server listens (must happen within 10s),
// so start listening right away and let requests wait on a shared init promise
const ready = api.init();

// use as express middleware
app.use(async (req, res) => {
  await ready;
  return api.handleRequest(req, req, res);
});

// Lambda sets AWS_LAMBDA_HTTP_ENDPOINT to the host:port the server must listen on
const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || '127.0.0.1:9000').split(':');

// start server
app.listen(port, host, () => console.info(`api listening at http://${host}:${port}`));
