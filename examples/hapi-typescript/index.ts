import 'source-map-support/register';
import OpenAPIBackend from 'openapi-backend';
import Hapi from '@hapi/hapi';

const server = new Hapi.Server({ port: 9000 });

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
    getPets: async (context, req: Hapi.Request) => ({ operationId: context.operation.operationId }),
    getPetById: async (context, req: Hapi.Request) => ({ operationId: context.operation.operationId }),
    validationFail: async (context, req: Hapi.Request, h: Hapi.ResponseToolkit) =>
      h.response({ err: context.validation.errors }).code(400),
    notFound: async (context, req: Hapi.Request, h: Hapi.ResponseToolkit) =>
      h.response({ context, err: 'not found' }).code(404),
  },
});

api.init();

// use as a catch-all handler
server.route({
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  path: '/{path*}',
  handler: (req, h) =>
    api.handleRequest(
      {
        method: req.method,
        path: req.path,
        body: req.payload,
        query: req.query,
        headers: req.headers,
      },
      req,
      h,
    ),
});

// start server
server.start().then(() => console.info(`listening on ${server.info.uri}`));
