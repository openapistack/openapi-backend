const OpenAPIBackend = require('openapi-backend').default;
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// define api
const api = new OpenAPIBackend({ definition: './openapi.yml' });

// register default handlers
api.register({
  notFound: async (c, req, res) => res.status(404).json({ err: 'not found' }),
  unauthorizedHandler: async (c, req, res) => res.status(401).json({ err: 'unauthorized' }),
});

// register security handler for jwt auth
api.registerSecurityHandler('jwtAuth', (c, req, res) => {
  const authHeader = c.request.headers['authorization'];
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }
  const token = authHeader.replace('Bearer ', '');
  return jwt.verify(token, 'secret');
});

// register operation handlers
api.register({
  // GET /me
  me: async (c, req, res) => {
    const tokenData = c.security.jwtAuth;
    return res.status(200).json(tokenData);
  },
  // GET /login
  login: async (c, req, res) => {
    const token = jwt.sign({ name: 'John Doe', email: 'john@example.com' }, 'secret');
    return res.status(200).json({ token });
  },
});

api.init();

// use as express middleware
app.use((req, res) => api.handleRequest(req, req, res));

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
