const OpenAPIBackend = require('openapi-backend').default;
const express = require('express');

const app = express();
app.use(express.json());

// define api
const api = new OpenAPIBackend({ definition: './openapi.yml' });

// register handlers
api.register({
  getPets: async (c, req, res) => res.status(200).json({ operationId: c.operation.operationId }),
  getPetById: async (c, req, res) => res.status(200).json({ operationId: c.operation.operationId }),
  validationFail: async (c, req, res) => res.status(400).json({ err: c.validation.errors }),
  notFound: async (c, req, res) => res.status(404).json({ err: 'not found' }),
  unauthorizedHandler: async (c, req, res) => res.status(401).json({ err: 'unauthorized' }),
});

// register security handler
api.registerSecurityHandler('apiKey', (c, req, res) => {
  const authHeader = c.request.headers['x-api-key'];
  return authHeader === 'secret';
});

api.init();

// use as express middleware
app.use((req, res) => api.handleRequest(req, req, res));

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
