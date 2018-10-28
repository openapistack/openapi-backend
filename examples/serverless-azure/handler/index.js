const OpenAPIBackend = require('openapi-backend').default;

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
    getPets: (context, req) => {
      context.res = {
        status: 200,
        body: JSON.stringify({ operationId: 'getPets' }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
    getPetById: (context, req) => {
      context.res = {
        status: 200,
        body: JSON.stringify({ operationId: 'getPetById' }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
    notFound: (context, req) => {
      context.res = {
        status: 404,
        body: JSON.stringify({ err: 'not found' }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
    validationFail: (err, context, req) => {
      context.res = {
        status: 400,
        body: JSON.stringify({ err }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
  },
});

api.init();

module.exports = (context, req) =>
  api.handleRequest(
    {
      method: req.method,
      path: req.params.path,
      query: req.query,
      body: req.body,
      headers: req.headers,
    },
    context,
    req,
  );
