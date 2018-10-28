import 'source-map-support/register';
import OpenAPIBackend from 'openapi-backend';
import Hapi from 'hapi';

const server = new Hapi.Server({ host: '0.0.0.0', port: 9000 });

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
    getPets: async (req: Hapi.Request) => ({ operationId: 'getPets' }),
    getPetById: async (req: Hapi.Request) => ({ operationId: 'getPetById' }),
    notFound: async (req: Hapi.Request, h: Hapi.ResponseToolkit) => h.response({ err: 'not found' }).code(404),
    validationFail: async (err, req: Hapi.Request, h: Hapi.ResponseToolkit) => h.response({ err }).code(400),
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
