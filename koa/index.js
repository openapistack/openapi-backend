const OpenAPIBackend = require('openapi-backend').default;
const Koa = require('koa');
const bodyparser = require('koa-bodyparser');
const app = new Koa();
app.use(bodyparser());

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
        post: {
          operationId: 'createPet',
          requestBody: {
            description: 'Pet object to create',
            content: {
              'application/json': {},
            },
          },
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
    getPets: async (c, ctx) => {
      ctx.body = { operationId: c.operation.operationId };
    },
    getPetById: async (c, ctx) => {
      ctx.body = { operationId: c.operation.operationId };
    },
    createPet: async (c, ctx) => {
      ctx.body = { operationId: c.operation.operationId };
      ctx.status = 201;
    },
    validationFail: async (c, ctx) => {
      ctx.body = { err: c.validation.errors };
      ctx.status = 400;
    },
    notFound: async (c, ctx) => {
      ctx.body = { err: 'not found' };
      ctx.status = 404;
    },
  },
});

api.init();

// use as koa middleware
app.use((ctx) =>
  api.handleRequest(
    {
      method: ctx.request.method,
      path: ctx.request.path,
      body: ctx.request.body,
      query: ctx.request.query,
      headers: ctx.request.headers,
    },
    ctx,
  ),
);

// start server
app.listen(9000, () => console.info('api listening at http://localhost:9000'));
