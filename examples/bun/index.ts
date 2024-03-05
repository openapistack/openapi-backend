import OpenAPIBackend from "openapi-backend";
import {type Serve} from "bun";

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
    getPets: async (c, req, res) => Response.json({ operationId: c.operation.operationId }),
    getPetById: async (c, req, res) => Response.json({ operationId: c.operation.operationId }),
    validationFail: async (c, req, res) => Response.json({ err: c.validation.errors }, {status: 400}),
    notFound: async (c, req, res) => Response.json({ err: 'not found' }, {status: 404}),
  },
});

api.init();

export default {
  port: 9000,
  fetch(req) {
    const {pathname, search} = new URL(req.url);

    return api.handleRequest({
      path: pathname,
      query: search,
      method: req.method,
      headers: req.headers.toJSON(),
      body: req.body
    }, req, new Response(null, {status: 200}));
  },
} satisfies Serve;
