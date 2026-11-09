/* eslint-disable @typescript-eslint/no-explicit-any */

import * as http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import Fastify from 'fastify';
import type { OpenAPIV3_1 } from 'openapi-types';
import { OpenAPIBackend, Context } from './backend';
import { createTestClient, lambda, ResponseValidationError, RoutingError, TestClient } from './testing';

const pet = {
  type: 'object',
  required: ['id', 'name', 'type'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['cat', 'dog'] },
  },
} as const;

const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const errorResponse = {
  description: 'Error',
  ...json({ type: 'object', required: ['message'], properties: { message: { type: 'string' } } }),
};

const definition = {
  openapi: '3.1.0',
  info: { title: 'Pet Store', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        operationId: 'getPets',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'tags', in: 'query', explode: false, schema: { type: 'array', items: { type: 'string' } } },
          {
            name: 'filter',
            in: 'query',
            style: 'deepObject',
            schema: { type: 'object', properties: { type: { type: 'string' } } },
          },
          { name: 'x-request-id', in: 'header', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Pets',
            headers: { 'x-total-count': { required: true, schema: { type: 'integer' } } },
            ...json({ type: 'array', items: pet }),
          },
        },
      },
      post: {
        operationId: 'createPet',
        security: [{ jwt: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'type'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 64 },
                  type: { type: 'string', enum: ['cat', 'dog'] },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
              examples: {
                garfield: { value: { name: 'Garfield', type: 'cat' } },
                odie: { value: { name: 'Odie', type: 'dog' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Created', ...json(pet) }, 400: errorResponse, 401: errorResponse },
      },
    },
    '/pets/meta': {
      get: {
        operationId: 'getPetsMeta',
        responses: {
          '2XX': {
            description: 'Meta',
            ...json({ type: 'object', required: ['count'], properties: { count: { type: 'integer' } } }),
          },
        },
      },
    },
    '/pets/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        operationId: 'getPetById',
        responses: { 200: { description: 'Pet', ...json(pet) }, 400: errorResponse, 404: errorResponse },
      },
      delete: {
        operationId: 'deletePetById',
        security: [{ jwt: [] }],
        responses: { 204: { description: 'Deleted' }, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    '/users/me': {
      get: { operationId: 'getCurrentUser', responses: { 200: { description: 'Me' } } },
    },
    '/users/{username}': {
      get: {
        operationId: 'getUserByUsername',
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User' } },
      },
    },
    '/codes': {
      post: {
        operationId: 'createCode',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', pattern: '^[A-Z]{3}$' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/uploads': {
      post: {
        operationId: 'upload',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['name', 'file'],
                properties: { name: { type: 'string' }, file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 204: { description: 'Uploaded' } },
      },
    },
    '/forms': {
      post: {
        operationId: 'submitForm',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
            },
          },
        },
        responses: { default: { description: 'Anything', ...json({ type: 'object' }) } },
      },
    },
  },
  components: {
    securitySchemes: { jwt: { type: 'http', scheme: 'bearer' } },
  },
} as OpenAPIV3_1.Document;

const pets = [
  { id: 1, name: 'Garfield', type: 'cat' },
  { id: 2, name: 'Odie', type: 'dog' },
];

interface Result {
  statusCode: number;
  headers?: { [name: string]: string };
  body?: unknown;
}

// framework agnostic handlers that return their responses
const handlers: { [operationId: string]: (c: Context) => Result | Promise<Result> } = {
  getPets: (c) => ({
    statusCode: 200,
    headers: { 'x-total-count': String(pets.length) },
    body: pets.slice(0, Number(c.request.query.limit || 10)),
  }),
  createPet: (c) => ({ statusCode: 201, body: { id: 3, ...c.request.requestBody } }),
  getPetsMeta: () => ({ statusCode: 200, body: { count: pets.length } }),
  getPetById: (c) => {
    const found = pets.find((p) => p.id === Number(c.request.params.id));
    return found ? { statusCode: 200, body: found } : { statusCode: 404, body: { message: 'Pet not found' } };
  },
  deletePetById: (c) =>
    c.security.jwt?.role === 'admin' ? { statusCode: 204 } : { statusCode: 403, body: { message: 'Forbidden' } },
  getCurrentUser: () => ({ statusCode: 200 }),
  getUserByUsername: () => ({ statusCode: 200 }),
  createCode: () => ({ statusCode: 201 }),
  submitForm: (c) => ({ statusCode: 200, body: c.request.requestBody }),
  upload: () => ({ statusCode: 204 }),
  validationFail: (c) => ({ statusCode: 400, body: { message: 'Bad request', errors: c.validation.errors } }),
  unauthorizedHandler: () => ({ statusCode: 401, body: { message: 'Unauthorized' } }),
  notFound: () => ({ statusCode: 404, body: { message: 'Not found' } }),
};

const securityHandlers = {
  jwt: (c: Context) => (c.request.headers.authorization === 'Bearer valid' ? { sub: 'alice' } : false),
};

const createApi = (opts: Partial<ConstructorParameters<typeof OpenAPIBackend>[0]> = {}) =>
  new OpenAPIBackend({
    definition: JSON.parse(JSON.stringify(definition)),
    strict: true,
    handlers: handlers as any,
    securityHandlers,
    ...opts,
  });

const transformResponse = (result: Result) => ({
  status: result.statusCode,
  headers: { 'content-type': 'application/json', ...result.headers },
  body: result.body,
});

/**
 * An Express app serving the API, with handlers that write to res
 */
const createExpressApp = (api: OpenAPIBackend, mount = '/') => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(mount, (req, res, next) => api.handleRequest(req as any, req, res).catch(next));
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ message: err.message });
  });
  return app;
};

const expressHandlers = Object.fromEntries(
  Object.entries(handlers).map(([operationId, handler]) => [
    operationId,
    async (c: Context, _req: express.Request, res: express.Response) => {
      const result = await handler(c);
      res.status(result.statusCode);
      res.set(result.headers || {});
      return result.body === undefined ? res.end() : res.json(result.body);
    },
  ]),
);

describe('createTestClient', () => {
  describe('without an app', () => {
    let api: OpenAPIBackend;
    let client: TestClient;

    beforeAll(async () => {
      api = createApi();
      await api.init();
      client = createTestClient(api, { transformResponse });
    });

    test('requires an app or transformResponse', () => {
      expect(() => createTestClient(api)).toThrow(
        /pass the app that serves your API as `app`, or a `transformResponse`/,
      );
    });

    test('calls operations by operationId', async () => {
      const res = await client.getPetById({ params: { id: 1 } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 1, name: 'Garfield', type: 'cat' });
      expect(res.operationId).toBe('getPetById');
      expect(res.headers['content-type']).toBe('application/json');
    });

    test('resolves for every status code', async () => {
      const res = await client.getPetById({ params: { id: 999 } });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Pet not found' });
    });

    test('only enumerates status, headers, body and operationId', async () => {
      const res = await client.getPetById({ params: { id: 1 } });

      expect(Object.keys(res)).toEqual(['status', 'headers', 'body', 'operationId']);
      expect(res.operation?.operationId).toBe('getPetById');
      expect(res.request.method).toBe('GET');
    });

    test('records the context openapi-backend built for the request', async () => {
      const res = await client.getPetById({ params: { id: 1 } });

      expect(res.context?.operation.operationId).toBe('getPetById');
      expect(res.context?.request.params).toEqual({ id: '1' });
      expect(res.context?.validation.valid).toBe(true);
    });

    test('serializes query parameters with the style and explode of each parameter', async () => {
      const res = await client.getPets({
        query: { limit: 1, tags: ['cat', 'dog'], filter: { type: 'cat' } },
        headers: { 'X-Request-Id': 'test-1' },
      });

      expect(res.status).toBe(200);
      expect(res.request.url).toBe('/pets?limit=1&tags=cat,dog&filter[type]=cat');
      expect(res.request.query).toBe('limit=1&tags=cat,dog&filter[type]=cat');
      expect(res.request.headers['x-request-id']).toBe('test-1');
      expect(res.context?.request.query).toEqual({ limit: '1', tags: ['cat', 'dog'], filter: { type: 'cat' } });
      expect(res.context?.validation.valid).toBe(true);
    });

    test('sends cookies in the cookie header', async () => {
      const res = await client.getPets({ cookies: { session: 'abc 123' } });

      expect(res.request.headers.cookie).toBe('session=abc%20123');
      expect(res.context?.request.cookies).toEqual({ session: 'abc 123' });
    });

    test('encodes the body as JSON', async () => {
      const alice = client.with({ security: { jwt: { sub: 'alice' } } });
      const res = await alice.createPet({ body: { name: 'Garfield', type: 'cat' } });

      expect(res.status).toBe(201);
      expect(res.request.headers['content-type']).toBe('application/json');
      expect(res.request.body).toBe('{"name":"Garfield","type":"cat"}');
      expect(res.body).toEqual({ id: 3, name: 'Garfield', type: 'cat' });
    });

    test('encodes form bodies', async () => {
      const res = await client.submitForm({ body: { name: 'Garfield' } });

      expect(res.request.headers['content-type']).toBe('application/x-www-form-urlencoded');
      expect(res.request.body).toBe('name=Garfield');
      expect(res.body).toEqual({ name: 'Garfield' });
    });

    test('encodes multipart bodies', async () => {
      const res = await client.upload({ body: { name: 'cat.txt', file: Buffer.from('meow') } });

      expect(res.status).toBe(204);
      expect(res.request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(res.request.body?.toString()).toContain('name="name"');
      expect(res.request.body?.toString()).toContain('meow');
      expect(res.context.validation.valid).toBe(true);
    });

    test('lets requests that fail validation through to the validationFail handler', async () => {
      const alice = client.with({ security: { jwt: { sub: 'alice' } } });
      const res = await alice.createPet({ body: { type: 'cat' } });

      expect(res.status).toBe(400);
      expect(res.context?.validation.valid).toBe(false);
      expect(res.context?.validation.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ params: { missingProperty: 'name' } })]),
      );
    });

    test('throws errors from handleRequest()', async () => {
      const strictApi = createApi({ handlers: { ...handlers, validationFail: undefined } as any });
      const strictClient = createTestClient(strictApi, { transformResponse });

      await expect(strictClient.getPetById({ params: { id: 'abc' } })).rejects.toThrow('400-validationFail');
    });

    test('accepts fetch Responses from transformResponse', async () => {
      const fetchClient = createTestClient(api, {
        transformResponse: (result: Result) =>
          new Response(JSON.stringify(result.body), {
            status: result.statusCode,
            headers: { 'content-type': 'application/json' },
          }),
      });
      const res = await fetchClient.getPetsMeta();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 2 });
    });

    test('initializes the api on the first request', async () => {
      const lazyApi = createApi();
      const lazyClient = createTestClient(lazyApi, { transformResponse });

      expect(lazyApi.initialized).toBeFalsy();
      const res = await lazyClient.getPetsMeta();
      expect(res.status).toBe(200);
      expect(lazyApi.initialized).toBe(true);
    });

    test("isn't thenable", async () => {
      expect((client as any).then).toBeUndefined();
      expect(await Promise.resolve(client)).toBe(client);
    });

    test('call() calls operations by name', async () => {
      const res = await client.call('getPetById', { params: { id: 2 } });

      expect(res.body.name).toBe('Odie');
    });
  });

  describe('response validation', () => {
    test('throws when the body does not match the spec', async () => {
      const api = createApi();
      api.register('getPetById', () => ({ statusCode: 200, body: { id: 1, type: 'hamster' } }));
      const client = createTestClient(api, { transformResponse });

      const error = await client.getPetById({ params: { id: 1 } }).catch((err) => err);

      expect(error).toBeInstanceOf(ResponseValidationError);
      expect(error.errors).toEqual([
        { location: 'body.name', message: "must have required property 'name'" },
        { location: 'body.type', message: 'must be equal to one of the allowed values: cat, dog' },
      ]);
      expect(error.message).toContain("getPetById's 200 response doesn't match the API spec");
      expect(error.message).toContain('GET /pets/1  →  getPetById');
      expect(error.message).toContain('Documented at paths./pets/{id}.get.responses.200');
      expect(error.response.status).toBe(200);
    });

    test('throws for undocumented status codes', async () => {
      const api = createApi();
      api.register('getPetById', () => ({ statusCode: 500, body: { message: 'oops' } }));
      const client = createTestClient(api, { transformResponse });

      await expect(client.getPetById({ params: { id: 1 } })).rejects.toThrow(
        'getPetById responded with an undocumented 500',
      );
      await expect(client.getPetById({ params: { id: 1 } })).rejects.toThrow(
        'The API spec documents 200, 400 and 404.',
      );
    });

    test('throws for undocumented content types', async () => {
      const api = createApi();
      api.register('getPetById', () => ({ statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<p>' }));
      const client = createTestClient(api, { transformResponse });

      const error = await client.getPetById({ params: { id: 1 } }).catch((err) => err);

      expect(error.errors).toEqual([
        {
          location: 'headers.content-type',
          message: "text/html isn't documented. The API spec documents application/json",
        },
      ]);
    });

    test('throws when a required response header is missing', async () => {
      const api = createApi();
      api.register('getPets', () => ({ statusCode: 200, body: [] }));
      const client = createTestClient(api, { transformResponse });

      const error = await client.getPets().catch((err) => err);

      expect(error.errors).toEqual([{ location: 'headers.x-total-count', message: expect.any(String) }]);
    });

    test('matches status code ranges', async () => {
      const api = createApi();
      api.register('getPetsMeta', () => ({ statusCode: 202, body: { count: 'two' } }));
      const client = createTestClient(api, { transformResponse });

      const error = await client.getPetsMeta().catch((err) => err);

      expect(error.errors).toEqual([{ location: 'body.count', message: 'must be integer' }]);
      expect(error.message).toContain('responses.2XX');
    });

    test('can be turned off', async () => {
      const api = createApi();
      api.register('getPetById', () => ({ statusCode: 500 }));
      const client = createTestClient(api, { transformResponse });

      expect((await client.getPetById({ params: { id: 1 }, validateResponse: false })).status).toBe(500);
      expect((await client.with({ validateResponse: false }).getPetById({ params: { id: 1 } })).status).toBe(500);
      const lenient = createTestClient(api, { transformResponse, validateResponse: false });
      expect((await lenient.getPetById({ params: { id: 1 } })).status).toBe(500);
    });

    test('does not check responses to unknown routes', async () => {
      const client = createTestClient(createApi(), { transformResponse });
      const res = await client.request('GET /cats');

      expect(res.status).toBe(404);
      expect(res.operationId).toBeUndefined();
    });
  });

  describe('routing', () => {
    let client: TestClient;

    beforeAll(() => {
      client = createTestClient(createApi(), { transformResponse });
    });

    test('throws when a request is routed to another operation', async () => {
      const error = await client.getUserByUsername({ params: { username: 'me' } }).catch((err) => err);

      expect(error).toBeInstanceOf(RoutingError);
      expect(error.message).toBe(
        'client.getUserByUsername() sent GET /users/me, but the router matched getCurrentUser (GET /users/me) instead.\n' +
          'getUserByUsername can\'t be reached with { username: "me" }.',
      );
      expect(error.operationId).toBe('getUserByUsername');
      expect(error.matchedOperationId).toBe('getCurrentUser');
    });

    test('throws for unknown operations', async () => {
      await expect(client.getPetByID({ params: { id: 1 } })).rejects.toThrow(
        'Unknown operationId "getPetByID". Did you mean "getPetById"?',
      );
    });

    test('throws for missing and unknown path parameters', async () => {
      await expect(client.getPetById()).rejects.toThrow('Missing path parameter "id" for getPetById (GET /pets/{id})');
      await expect(client.getPetById({ params: { petId: 1 } })).rejects.toThrow(
        'Unknown path parameter "petId" for getPetById (GET /pets/{id}). Its path parameters are: id',
      );
    });

    test('sends raw requests', async () => {
      const res = await client.request('GET /pets/meta');

      expect(res.status).toBe(200);
      expect(res.operationId).toBe('getPetsMeta');
    });

    test('sends raw requests to path templates', async () => {
      const res = await client.request('get /pets/2?unknown=1');

      expect(res.operationId).toBe('getPetById');
      expect(res.status).toBe(400);
      expect(res.context?.validation.valid).toBe(false);
    });

    test('accepts raw request objects', async () => {
      const res = await client.request({ method: 'GET', path: '/pets', query: { limit: 1 } });

      expect(res.request.url).toBe('/pets?limit=1');
      expect(res.body).toHaveLength(1);
    });

    test('sends malformed bodies', async () => {
      const res = await client.request('POST /pets', {
        security: { jwt: { sub: 'alice' } },
        body: '{ "name": ',
      });

      expect(res.request.headers['content-type']).toBe('application/json');
      expect(res.status).toBe(400);
      expect(res.context?.validation.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ keyword: 'parse' })]),
      );
    });
  });

  describe('client.with()', () => {
    test('adds options to every request, without changing the client', async () => {
      const client = createTestClient(createApi(), { transformResponse, headers: { 'X-Tenant': 'acme' } });
      const alice = client.with({ headers: { authorization: 'Bearer valid' }, cookies: { theme: 'dark' } });

      const res = await alice.getPets({ headers: { 'x-tenant': 'globex' } });

      expect(res.request.headers).toMatchObject({
        'x-tenant': 'globex',
        authorization: 'Bearer valid',
        cookie: 'theme=dark',
      });
      expect((await client.getPets()).request.headers.authorization).toBeUndefined();
    });

    test('removes options set to undefined', async () => {
      const client = createTestClient(createApi(), { transformResponse }).with({ headers: { authorization: 'x' } });
      const res = await client.getPets({ headers: { authorization: undefined } });

      expect(res.request.headers.authorization).toBeUndefined();
    });
  });

  describe('examples', () => {
    let client: TestClient;

    beforeAll(() => {
      client = createTestClient(createApi(), { transformResponse }).with({ security: { jwt: { sub: 'alice' } } });
    });

    test('builds requests from the first example', async () => {
      const res = await client.createPet({ example: true });

      expect(JSON.parse(res.request.body as string)).toEqual({ name: 'Garfield', type: 'cat' });
      expect(res.status).toBe(201);
    });

    test('picks named examples', async () => {
      const res = await client.createPet({ example: 'odie' });

      expect(JSON.parse(res.request.body as string)).toEqual({ name: 'Odie', type: 'dog' });
    });

    test('throws for unknown example names', async () => {
      await expect(client.createPet({ example: 'nermal' })).rejects.toThrow(
        'createPet has no example named "nermal". Its examples are: garfield, odie',
      );
    });

    test('deep merges overrides into the example', async () => {
      const res = await client.createPet({ example: true, body: { name: '', tags: ['lazy'] } });

      expect(JSON.parse(res.request.body as string)).toEqual({ name: '', type: 'cat', tags: ['lazy'] });
      expect(res.status).toBe(400);
    });

    test('removes properties set to undefined', async () => {
      const res = await client.createPet({ example: true, body: { type: undefined } });

      expect(JSON.parse(res.request.body as string)).toEqual({ name: 'Garfield' });
      expect(res.context?.validation.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ params: { missingProperty: 'type' } })]),
      );
    });

    test('generates path parameters from schemas', async () => {
      const res = await client.getPetById({ example: true });

      expect(res.request.url).toBe('/pets/0');
      expect(res.status).toBe(404);
    });

    test('throws when the generated example is not valid', async () => {
      await expect(client.createCode({ example: true })).rejects.toThrow(
        /The example request for createCode doesn't pass validation:\n\n {2}body\.code {2}must match pattern/,
      );
    });
  });

  describe('security', () => {
    let client: TestClient;

    beforeAll(() => {
      client = createTestClient(createApi(), { transformResponse });
    });

    test('runs security handlers', async () => {
      expect((await client.createPet({ example: true })).status).toBe(401);
      const res = await client.createPet({ example: true, headers: { authorization: 'Bearer valid' } });
      expect(res.status).toBe(201);
      expect(res.context?.security).toEqual({ authorized: true, jwt: { sub: 'alice' } });
    });

    test('uses stubbed security handler results', async () => {
      const admin = client.with({ security: { jwt: { role: 'admin' } } });
      const user = client.with({ security: { jwt: { role: 'user' } } });

      expect((await admin.deletePetById({ params: { id: 1 } })).status).toBe(204);
      expect((await user.deletePetById({ params: { id: 1 } })).status).toBe(403);
      expect((await client.with({ security: { jwt: false } }).deletePetById({ params: { id: 1 } })).status).toBe(401);
    });
  });

  describe('with an Express app', () => {
    let api: OpenAPIBackend;
    let client: TestClient;

    beforeAll(async () => {
      api = createApi({ handlers: expressHandlers as any });
      await api.init();
      client = createTestClient(api, { app: createExpressApp(api) });
    });

    test('sends requests into the app', async () => {
      const res = await client.getPets({ query: { limit: 1 } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1, name: 'Garfield', type: 'cat' }]);
      expect(res.headers['x-total-count']).toBe('2');
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    });

    test('records the context, without exposing the test header', async () => {
      const res = await client.getPetById({ params: { id: 2 } });

      expect(res.context?.operation.operationId).toBe('getPetById');
      expect(res.request.headers['x-openapi-backend-test-id']).toBeUndefined();
    });

    test('supports security stubs', async () => {
      const alice = client.with({ security: { jwt: { sub: 'alice' } } });
      const res = await alice.createPet({ body: { name: 'Garfield', type: 'cat' } });

      expect(res.status).toBe(201);
      expect(res.context?.security.jwt).toEqual({ sub: 'alice' });
    });

    test('runs middleware before openapi-backend', async () => {
      const res = await client.request('POST /pets', { body: '{ "name": ' });

      expect(res.status).toBe(400);
      expect(res.context).toBeUndefined();
      expect(res.body.message).toMatch(/JSON/);
    });

    test('supports apps that serve the API under a base path', async () => {
      const mounted = createTestClient(api, { app: createExpressApp(api, '/api'), basePath: '/api' });
      const res = await mounted.getPetById({ params: { id: 1 } });

      expect(res.request.url).toBe('/api/pets/1');
      expect(res.status).toBe(200);
      expect((await mounted.request('GET /api/pets/meta')).operationId).toBe('getPetsMeta');
    });

    test('supports http.Server and Koa style apps', async () => {
      const app = createExpressApp(api);
      const fromServer = createTestClient(api, { app: http.createServer(app) });
      const fromCallback = createTestClient(api, { app: { callback: () => app } });

      expect((await fromServer.getPetsMeta()).body).toEqual({ count: 2 });
      expect((await fromCallback.getPetsMeta()).body).toEqual({ count: 2 });
    });
  });

  describe('with a Fastify app', () => {
    test('uses inject()', async () => {
      const api = createApi();
      const app = Fastify();
      app.route({
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        url: '/*',
        handler: async (request, reply) => {
          const result: Result = await api.handleRequest(
            {
              method: request.method,
              path: request.url,
              body: request.body,
              query: request.query as any,
              headers: request.headers as any,
            },
            request,
            reply,
          );
          return reply
            .code(result.statusCode)
            .headers(result.headers || {})
            .send(result.body);
        },
      });
      const client = createTestClient(api, { app });

      const res = await client.with({ security: { jwt: { sub: 'alice' } } }).createPet({ example: 'odie' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 3, name: 'Odie', type: 'dog' });
      expect(res.context?.security.jwt).toEqual({ sub: 'alice' });
    });
  });

  describe('with a fetch app', () => {
    test('calls fetch()', async () => {
      const api = createApi();
      const app = {
        fetch: async (request: Request) => {
          const url = new URL(request.url);
          const text = await request.text();
          const result: Result = await api.handleRequest({
            method: request.method,
            path: url.pathname + url.search,
            headers: Object.fromEntries(request.headers),
            body: text || undefined,
          });
          return Response.json(result.body ?? null, { status: result.statusCode, headers: result.headers });
        },
      };
      const client = createTestClient(api, { app });

      const res = await client.getPetById({ params: { id: 1 } });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Garfield');
      expect(res.context?.operation.operationId).toBe('getPetById');
    });
  });

  describe('with a custom adapter', () => {
    test('calls send() with the request', async () => {
      const api = createApi();
      const client = createTestClient(api, {
        app: {
          send: async (request) => transformResponse(await api.handleRequest(request)),
        },
      });

      const res = await client.getPets({ query: { tags: ['cat'] } });

      expect(res.status).toBe(200);
      expect(res.context?.request.query).toEqual({ tags: ['cat'] });
    });
  });

  describe('with an AWS Lambda handler', () => {
    const api = createApi();
    const toLambdaResult = (result: Result) => ({
      statusCode: result.statusCode,
      headers: result.headers,
      body: result.body === undefined ? '' : JSON.stringify(result.body),
    });

    test('sends API Gateway REST API events', async () => {
      const handler = async (event: any, context: any) =>
        toLambdaResult(
          await api.handleRequest(
            {
              method: event.httpMethod,
              path: event.path,
              query: event.queryStringParameters,
              body: event.body,
              headers: event.headers,
            },
            event,
            context,
          ),
        );
      const client = createTestClient(api, { app: lambda(handler) });

      const res = await client.getPets({ query: { limit: 1 } });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/json');
      expect(res.body).toEqual([{ id: 1, name: 'Garfield', type: 'cat' }]);
      expect(res.context?.operation.operationId).toBe('getPets');
    });

    test('sends HTTP API events', async () => {
      const events: any[] = [];
      const handler = async (event: any) => {
        events.push(event);
        return toLambdaResult(
          await api.handleRequest({
            method: event.requestContext.http.method,
            path: event.rawPath,
            query: event.rawQueryString,
            body: event.body,
            headers: event.headers,
          }),
        );
      };
      const client = createTestClient(api, { app: lambda(handler, { event: 'v2' }) });

      const res = await client
        .with({ security: { jwt: { sub: 'alice' } } })
        .createPet({ example: true, cookies: { session: 'abc' } });

      expect(res.status).toBe(201);
      expect(events[0]).toMatchObject({ version: '2.0', rawPath: '/pets', cookies: ['session=abc'] });
    });

    test('infers the response for payload format 2.0', async () => {
      const client = createTestClient(api, { app: lambda(async () => ({ count: 2 }), { event: 'v2' }) });

      const res = await client.getPetsMeta();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 2 });
    });
  });

  describe('with a running server', () => {
    let server: http.Server;
    let api: OpenAPIBackend;

    beforeAll(async () => {
      api = createApi({ handlers: expressHandlers as any });
      server = createExpressApp(api).listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
    });

    afterAll(() => {
      server.close();
    });

    test('sends requests over the network', async () => {
      const { port } = server.address() as AddressInfo;
      const client = createTestClient(api, { app: `http://127.0.0.1:${port}` });

      const res = await client.getPetById({ params: { id: 1 } });

      expect(res.status).toBe(200);
      expect(res.operationId).toBe('getPetById');
      expect(res.context).toBeUndefined();
      await expect(client.with({ security: { jwt: {} } }).getPetsMeta()).rejects.toThrow(
        'Security stubs only work when the request is handled in the same process as your tests',
      );
    });
  });

  test('types operation methods with the Operations type from typegen', () => {
    interface Operations {
      getPetById: {
        requestBody: any;
        params: { id: number };
        query: any;
        headers: any;
        cookies: any;
        response: { id: number; name: string } | { message: string };
      };
      createPet: {
        requestBody: { name: string; type: 'cat' | 'dog' };
        params: any;
        query: any;
        headers: any;
        cookies: any;
        response: { id: number };
      };
    }
    const check = async (client: TestClient<Operations>) => {
      const res = await client.getPetById({ params: { id: 1 } });
      const body: { id: number; name: string } | { message: string } = res.body;
      await client.createPet({ example: true, body: { name: '' } });
      await client.call('createPet', { body: { name: 'Garfield', type: 'cat' } });
      await client.call('someOperation');
      // @ts-expect-error id must be a number
      await client.getPetById({ params: { id: 'garfield' } });
      // @ts-expect-error type is missing
      await client.createPet({ body: { name: 'Garfield' } });
      return body;
    };
    expect(check).toBeInstanceOf(Function);
  });
});
