const OpenAPIBackend = require('openapi-backend').default;

const fastify = require('fastify')();

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
    getPets: async (c, request, reply) => reply.code(200).send({ operationId: c.operation.operationId }),
    getPetById: async (c, request, reply) => reply.code(200).send({ operationId: c.operation.operationId }),
    validationFail: async (c, request, reply) => reply.code(400).send({ err: c.validation.errors }),
    notFound: async (c, request, reply) => reply.code(404).send({ err: 'not found' }),
  },
});

api.init();

// use as fastify middleware
fastify.route({
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  url: '/*',
  handler: async (request, reply) =>
    api.handleRequest(
      {
        method: request.method,
        path: request.url,
        body: request.body,
        query: request.query,
        headers: request.headers,
      },
      request,
      reply,
    ),
});

// start server
const start = async () => {
  try {
    await fastify.listen({ port: 9000 });
    console.info('api listening at http://localhost:9000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
