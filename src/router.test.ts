import { OpenAPIRouter, Operation } from './router';
import { OpenAPIBackend, Context } from './backend';
import { OpenAPIV3_1 } from 'openapi-types';

const headers = { accept: 'application/json' };

const responses: OpenAPIV3_1.ResponsesObject = {
  200: { description: 'ok' },
};

const pathId: OpenAPIV3_1.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: {
    type: 'integer',
  },
};

const hobbyId: OpenAPIV3_1.ParameterObject = {
  name: 'hobbyId',
  in: 'path',
  required: true,
  schema: {
    type: 'integer',
  },
};

const queryLimit: OpenAPIV3_1.ParameterObject = {
  name: 'limit',
  in: 'query',
  schema: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
  },
};

const queryFilter: OpenAPIV3_1.ParameterObject = {
  name: 'filter',
  in: 'query',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          hasOwner: {
            type: 'boolean',
          },
          age: {
            type: 'integer',
          },
          name: {
            type: 'string',
          },
        },
      },
    },
  },
};

const definition: OpenAPIV3_1.Document = {
  openapi: '3.0.0',
  info: {
    title: 'api',
    version: '1.0.0',
  },
  paths: {
    '/': {
      get: {
        operationId: 'apiRoot',
        responses,
      },
    },
    '/pets': {
      get: {
        operationId: 'getPets',
        responses,
      },
      post: {
        operationId: 'createPet',
        responses,
      },
      parameters: [queryLimit, queryFilter],
    },
    '/pets/{id}': {
      get: {
        operationId: 'getPetById',
        responses,
      },
      put: {
        operationId: 'replacePetById',
        responses,
      },
      patch: {
        operationId: 'updatePetById',
        responses,
      },
      delete: {
        operationId: 'deletePetById',
        responses,
      },
      parameters: [pathId],
    },
    '/pets/{id}/owner': {
      get: {
        operationId: 'getOwnerByPetId',
        responses,
      },
      parameters: [pathId],
    },
    '/pets/{id}/hobbies/{hobbyId}': {
      get: {
        operationId: 'getPetHobbies',
        responses,
      },
      parameters: [pathId, hobbyId],
    },
    '/pets/meta': {
      get: {
        operationId: 'getPetsMeta',
        responses,
      },
    },
  },
};

describe('OpenAPIRouter', () => {
  describe('.parseRequest', () => {
    const api = new OpenAPIRouter({ definition });

    test('parses requests', () => {
      const request = { path: '/', method: 'get', headers };

      const parsedRequest = api.parseRequest(request);

      expect(parsedRequest.path).toEqual('/');
      expect(parsedRequest.method).toEqual('get');
      expect(parsedRequest.query).toEqual({});
      expect(parsedRequest.headers).toEqual(headers);
    });

    test('parses request body passed as object', () => {
      const payload = { horse: 1 };
      const request = { path: '/pets', method: 'post', body: payload, headers };

      const parsedRequest = api.parseRequest(request);

      expect(parsedRequest.requestBody).toEqual(payload);
    });

    test('parses request body passed as JSON', () => {
      const payload = { horse: 1 };
      const request = { path: '/pets', method: 'post', body: JSON.stringify(payload), headers };

      const parsedRequest = api.parseRequest(request);

      expect(parsedRequest.requestBody).toEqual(payload);
    });

    test('parses path parameters', () => {
      const request = { path: '/pets/123', method: 'get', headers };
      const operation = api.getOperation('getPetById');

      const parsedRequest = api.parseRequest(request, operation);
      expect(parsedRequest.params).toEqual({ id: '123' });
    });

    test('parses query string from path prop', () => {
      const request = { path: '/pets?limit=10', method: 'get', headers };

      const parsedRequest = api.parseRequest(request);

      expect(parsedRequest.query).toEqual({ limit: '10' });
    });

    test('parses query string from query prop', () => {
      const request = { path: '/pets', query: 'limit=10', method: 'get', headers };

      const parsedRequest = api.parseRequest(request);

      expect(parsedRequest.query).toEqual({ limit: '10' });
    });

    test('parses query string from query prop starting with ?', () => {
      const request = { path: '/pets', query: '?limit=10', method: 'get', headers };

      const parsedRequest = api.parseRequest(request);

      expect(parsedRequest.query).toEqual({ limit: '10' });
    });

    test("parses query string content 'application/json' as JSON", () => {
      const filterValue = { age: 4, hasOwner: true, name: 'Spot' };
      const encoded = encodeURI(JSON.stringify(filterValue));
      const request = { path: `/pets?filter=${encoded}`, method: 'get', headers };

      const operation = api.getOperation('getPets') as Operation;
      const parsedRequest = api.parseRequest(request, operation);

      expect(parsedRequest.query.filter).toEqual(filterValue);
    });

    test('parses query string arrays', () => {
      const request = { path: '/pets?limit=10&limit=20', method: 'get', headers };
      const parsedRequest = api.parseRequest(request);
      expect(parsedRequest.query).toEqual({ limit: ['10', '20'] });
    });

    test('parses query string arrays when style=form, explode=false', () => {
      const request = { path: '/pets?limit=10,20', method: 'get', headers };
      const operation = api.getOperation('createPet') as Operation;
      operation.parameters = [
        {
          in: 'query',
          name: 'limit',
          style: 'form',
          explode: false,
        },
      ];

      const parsedRequest = api.parseRequest(request, operation);
      expect(parsedRequest.query).toEqual({ limit: ['10', '20'] });
    });

    test('parses query string arrays when style=spaceDelimited, explode=false', () => {
      const request = { path: '/pets?limit=10%2020', method: 'get', headers };
      const operation = api.getOperation('createPet') as Operation;
      operation.parameters = [
        {
          in: 'query',
          name: 'limit',
          style: 'spaceDelimited',
          explode: false,
        },
      ];

      const parsedRequest = api.parseRequest(request, operation);
      expect(parsedRequest.query).toEqual({ limit: ['10', '20'] });
    });

    test('parses query string arrays when style=pipeDelimited, explode=false', () => {
      const request = { path: '/pets?limit=10|20', method: 'get', headers };
      const operation = api.getOperation('createPet') as Operation;
      operation.parameters = [
        {
          in: 'query',
          name: 'limit',
          style: 'pipeDelimited',
          explode: false,
        },
      ];

      const parsedRequest = api.parseRequest(request, operation);
      expect(parsedRequest.query).toEqual({ limit: ['10', '20'] });
    });
  });

  describe('.matchOperation', () => {
    const api = new OpenAPIRouter({ definition });

    test('matches GET /', async () => {
      const { operationId } = api.matchOperation({ path: '/', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('apiRoot');
    });

    test('matches GET /pets', async () => {
      const { operationId } = api.matchOperation({ path: '/pets', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPets');
    });

    test('matches GET /pets/ with trailing slash', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPets');
    });

    test('matches POST /pets', async () => {
      const { operationId } = api.matchOperation({ path: '/pets', method: 'post', headers }) as Operation;
      expect(operationId).toEqual('createPet');
    });

    test('matches GET /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPetById');
    });

    test('matches PUT /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'put', headers }) as Operation;
      expect(operationId).toEqual('replacePetById');
    });

    test('matches PATCH /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'patch', headers }) as Operation;
      expect(operationId).toEqual('updatePetById');
    });

    test('matches DELETE /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'delete', headers }) as Operation;
      expect(operationId).toEqual('deletePetById');
    });

    test('matches GET /pets/{id}/owner', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1/owner', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getOwnerByPetId');
    });

    test('matches GET /pets/{id}/hobbies/{hobbyId}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1/hobbies/3', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPetHobbies');
    });

    test('matches GET /pets/meta', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/meta', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPetsMeta');
    });

    test('does not match GET /v2/pets', async () => {
      const operation = api.matchOperation({ path: '/v2/pets', method: 'get', headers }) as Operation;
      expect(operation).toBe(undefined);
    });
  });

  describe('.matchOperation with ignoreTrailingSlashes=false', () => {
    const api = new OpenAPIRouter({ definition, ignoreTrailingSlashes: false });

    test('matches GET /', async () => {
      const { operationId } = api.matchOperation({ path: '/', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('apiRoot');
    });

    test('matches GET /pets', async () => {
      const { operationId } = api.matchOperation({ path: '/pets', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPets');
    });

    test('does not match GET /pets/ with trailing slash', async () => {
      const operation = api.matchOperation({ path: '/pets/', method: 'get', headers }) as Operation;
      expect(operation).toBe(undefined);
    });
  });

  describe('.matchOperation with apiRoot = /api', () => {
    const api = new OpenAPIRouter({ definition, apiRoot: '/api' });

    test('matches GET /api as apiRoot', async () => {
      const { operationId } = api.matchOperation({ path: '/api', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('apiRoot');
    });

    test('matches GET /api/pets as getPets', async () => {
      const { operationId } = api.matchOperation({ path: '/api/pets', method: 'get', headers }) as Operation;
      expect(operationId).toEqual('getPets');
    });

    test('does not match GET /pets', async () => {
      const operation = api.matchOperation({ path: '/pets', method: 'get', headers }) as Operation;
      expect(operation).toBe(undefined);
    });
  });

  describe('.matchOperation with strict mode', () => {
    const api = new OpenAPIRouter({ definition });

    test('matches GET /', async () => {
      const { operationId } = api.matchOperation({ path: '/', method: 'get', headers }, true);
      expect(operationId).toEqual('apiRoot');
    });

    test('matches GET /pets', async () => {
      const { operationId } = api.matchOperation({ path: '/pets', method: 'get', headers }, true);
      expect(operationId).toEqual('getPets');
    });

    test('throws a 404 for GET /humans', async () => {
      const call = () => api.matchOperation({ path: '/humans', method: 'get', headers }, true);
      expect(call).toThrowError('404-notFound: no route matches request');
    });

    test('throws a 405 for DELETE /pets', async () => {
      const call = () => api.matchOperation({ path: '/pets', method: 'delete', headers }, true);
      expect(call).toThrowError('405-methodNotAllowed: this method is not registered for the route');
    });
  });
});

describe('OpenAPIBackend', () => {
  describe('.handleRequest', () => {
    const dummyHandlers: { [operationId: string]: jest.Mock<any> } = {};
    const dummyHandler = (operationId: string) => (dummyHandlers[operationId] = jest.fn(() => ({ operationId })));
    const api = new OpenAPIBackend({
      definition,
      handlers: {
        apiRoot: dummyHandler('apiRoot'),
        getPets: dummyHandler('getPets'),
        getPetById: dummyHandler('getPetById'),
        createPet: dummyHandler('createPet'),
        updatePetById: dummyHandler('updatePetById'),
        notImplemented: dummyHandler('notImplemented'),
        notFound: dummyHandler('notFound'),
      },
    });
    beforeAll(() => api.init());

    test('handles GET / and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/', headers });
      expect(res).toEqual({ operationId: 'apiRoot' });
      expect(dummyHandlers['apiRoot']).toBeCalled();

      const contextArg = dummyHandlers['apiRoot'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/', headers });
      expect(contextArg.operation.operationId).toEqual('apiRoot');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles GET /pets and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets', headers });
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalled();

      const contextArg = dummyHandlers['getPets'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets', headers });
      expect(contextArg.operation.operationId).toEqual('getPets');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles POST /pets and passes context', async () => {
      const res = await api.handleRequest({ method: 'POST', path: '/pets', headers });
      expect(res).toEqual({ operationId: 'createPet' });
      expect(dummyHandlers['createPet']).toBeCalled();

      const contextArg = dummyHandlers['createPet'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'post', path: '/pets', headers });
      expect(contextArg.operation.operationId).toEqual('createPet');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles GET /pets/1 and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/1', headers });
      expect(res).toEqual({ operationId: 'getPetById' });
      expect(dummyHandlers['getPetById']).toBeCalled();

      const contextArg = dummyHandlers['getPetById'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets/1', params: { id: '1' }, headers });
      expect(contextArg.operation.operationId).toEqual('getPetById');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles PATCH /pets/1 and passes context', async () => {
      const res = await api.handleRequest({ method: 'PATCH', path: '/pets/1', headers });
      expect(res).toEqual({ operationId: 'updatePetById' });
      expect(dummyHandlers['updatePetById']).toBeCalled();

      const contextArg = dummyHandlers['updatePetById'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'patch', path: '/pets/1', params: { id: '1' }, headers });
      expect(contextArg.operation.operationId).toEqual('updatePetById');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles a 404 for unregistered endpoint GET /humans and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/humans', headers });
      expect(res).toEqual({ operationId: 'notFound' });

      const contextArg = dummyHandlers['notFound'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/humans', headers });
      expect(contextArg.operation).toBeFalsy();
    });

    test('handles a 501 for not implemented endpoint DELETE /pets/1 and passes context', async () => {
      const res = await api.handleRequest({ method: 'DELETE', path: '/pets/1', headers });
      expect(res).toEqual({ operationId: 'notImplemented' });
      expect(dummyHandlers['notImplemented']).toBeCalled();

      const contextArg = dummyHandlers['notImplemented'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'delete', path: '/pets/1', params: { id: '1' }, headers });
      expect(contextArg.operation.operationId).toEqual('deletePetById');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles GET /pets/ with trailing slash and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/', headers });
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalled();

      const contextArg = dummyHandlers['getPets'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets/', headers });
      expect(contextArg.operation.operationId).toEqual('getPets');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles GET /pets/?limit=10 with query string and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/?limit=10', headers });
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalled();

      const contextArg = dummyHandlers['getPets'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets/', query: { limit: '10' }, headers });
      expect(contextArg.operation.operationId).toEqual('getPets');
      expect(contextArg.validation.errors).toBeFalsy();
    });
  });

  describe('.handleRequest postResponseHandler', () => {
    const dummyHandlers: { [operationId: string]: jest.Mock<any> } = {};
    const dummyHandler = (operationId: string) => (dummyHandlers[operationId] = jest.fn(() => ({ operationId })));
    const api = new OpenAPIBackend({
      definition,
      handlers: {
        apiRoot: dummyHandler('apiRoot'),
        getPets: dummyHandler('getPets'),
        getPetById: dummyHandler('getPetById'),
        createPet: dummyHandler('createPet'),
        updatePetById: dummyHandler('updatePetById'),
        notImplemented: dummyHandler('notImplemented'),
        notFound: dummyHandler('notFound'),
      },
    });
    beforeAll(() => api.init());

    test('handles GET / and passes response to postResponseHandler', async () => {
      const postResponseHandler = jest.fn((c: Context) => c && c.response);
      await api.register({ postResponseHandler });

      const res = await api.handleRequest({ method: 'GET', path: '/', headers });
      expect(dummyHandlers['apiRoot']).toBeCalled();
      expect(postResponseHandler).toBeCalled();
      expect(res).toEqual({ operationId: 'apiRoot' });

      const contextArg = postResponseHandler.mock.calls.slice(-1)[0][0] as Context;
      expect(contextArg.response).toMatchObject({ operationId: 'apiRoot' });
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/', headers });
    });

    test('handles GET /pets and passes response to postResponseHandler', async () => {
      const postResponseHandler = jest.fn((c: Context) => c && c.response);
      await api.register({ postResponseHandler });

      const res = await api.handleRequest({ method: 'GET', path: '/pets', headers });
      expect(dummyHandlers['getPets']).toBeCalled();
      expect(postResponseHandler).toBeCalled();
      expect(res).toEqual({ operationId: 'getPets' });

      const contextArg = postResponseHandler.mock.calls.slice(-1)[0][0] as Context;
      expect(contextArg.response).toMatchObject({ operationId: 'getPets' });
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets', headers });
    });

    test('handles GET /pets and allows postResponseHandler to intercept response', async () => {
      const postResponseHandler = jest.fn((ctx) => ({ you: 'have been intercepted' }));
      await api.register({ postResponseHandler });

      const res = await api.handleRequest({ method: 'GET', path: '/pets', headers });
      expect(dummyHandlers['getPets']).toBeCalled();
      expect(postResponseHandler).toBeCalled();
      expect(res).toEqual({ you: 'have been intercepted' });

      const contextArg = postResponseHandler.mock.calls.slice(-1)[0][0];
      expect(contextArg.response).toMatchObject({ operationId: 'getPets' });
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets', headers });
    });
  });
});
