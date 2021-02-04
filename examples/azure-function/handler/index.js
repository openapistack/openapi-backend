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
    getPets: (c, context, req) => {
      context.res = {
        status: 200,
        body: JSON.stringify({ operationId: c.operation.operationId }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
    getPetById: (c, context, req) => {
      context.res = {
        status: 200,
        body: JSON.stringify({ operationId: c.operation.operationId }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
    notFound: (c, context, req) => {
      context.res = {
        status: 404,
        body: JSON.stringify({ err: 'not found' }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
    validationFail: (c, context, req) => {
      context.res = {
        status: 400,
        body: JSON.stringify({ err: c.validation.errors }),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
  },
  quick: true,
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
