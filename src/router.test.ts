import { OpenAPIRouter } from './router';
import { OpenAPIBackend, Context } from './backend';
import { OpenAPIV3 } from 'openapi-types';

const headers = { accept: 'application/json' };

const responses: OpenAPIV3.ResponsesObject = {
  200: { description: 'ok' },
};

const pathId: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: {
    type: 'integer',
  },
};

const hobbyId: OpenAPIV3.ParameterObject = {
  name: 'hobbyId',
  in: 'path',
  required: true,
  schema: {
    type: 'integer',
  },
};

const queryLimit: OpenAPIV3.ParameterObject = {
  name: 'limit',
  in: 'query',
  schema: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
  },
};

const definition: OpenAPIV3.Document = {
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
      parameters: [queryLimit],
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
  describe('.matchOperation', () => {
    const api = new OpenAPIRouter({ definition });

    test('matches GET /', async () => {
      const { operationId } = api.matchOperation({ path: '/', method: 'get', headers });
      expect(operationId).toEqual('apiRoot');
    });

    test('matches GET /pets', async () => {
      const { operationId } = api.matchOperation({ path: '/pets', method: 'get', headers });
      expect(operationId).toEqual('getPets');
    });

    test('matches POST /pets', async () => {
      const { operationId } = api.matchOperation({ path: '/pets', method: 'post', headers });
      expect(operationId).toEqual('createPet');
    });

    test('matches GET /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'get', headers });
      expect(operationId).toEqual('getPetById');
    });

    test('matches PUT /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'put', headers });
      expect(operationId).toEqual('replacePetById');
    });

    test('matches PATCH /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'patch', headers });
      expect(operationId).toEqual('updatePetById');
    });

    test('matches DELETE /pets/{id}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1', method: 'delete', headers });
      expect(operationId).toEqual('deletePetById');
    });

    test('matches GET /pets/{id}/owner', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1/owner', method: 'get', headers });
      expect(operationId).toEqual('getOwnerByPetId');
    });

    test('matches GET /pets/{id}/hobbies/{hobbyId}', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/1/hobbies/3', method: 'get', headers });
      expect(operationId).toEqual('getPetHobbies');
    });

    test('matches GET /pets/meta', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/meta', method: 'get', headers });
      expect(operationId).toEqual('getPetsMeta');
    });
  });
});

describe('OpenAPIBackend', () => {
  describe('.handleRequest withContext=false', async () => {
    const dummyHandlers: { [operationId: string]: jest.Mock<any> } = {};
    const dummyHandler = (operationId: string) => (dummyHandlers[operationId] = jest.fn(() => ({ operationId })));
    const api = new OpenAPIBackend({
      definition,
      withContext: false,
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

    test('handles GET /', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/', headers }, 'param0', 'param0');
      expect(res).toEqual({ operationId: 'apiRoot' });
      expect(dummyHandlers['apiRoot']).toBeCalledWith('param0', 'param0');
    });

    test('handles GET /pets', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets', headers }, 'param0', 'param1');
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalledWith('param0', 'param1');
    });

    test('handles POST /pets', async () => {
      const res = await api.handleRequest({ method: 'POST', path: '/pets', headers }, 'param1', 'param2');
      expect(res).toEqual({ operationId: 'createPet' });
      expect(dummyHandlers['createPet']).toBeCalledWith('param1', 'param2');
    });

    test('handles GET /pets/1', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/1', headers }, 'param2', 'param3');
      expect(res).toEqual({ operationId: 'getPetById' });
      expect(dummyHandlers['getPetById']).toBeCalledWith('param2', 'param3');
    });

    test('handles PATCH /pets/1', async () => {
      const res = await api.handleRequest({ method: 'PATCH', path: '/pets/1', headers }, 'param3', 'param4');
      expect(res).toEqual({ operationId: 'updatePetById' });
      expect(dummyHandlers['updatePetById']).toBeCalledWith('param3', 'param4');
    });

    test('handles a 404 for unregistered endpoint GET /humans', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/humans', headers }, 'param4', 'param5');
      expect(res).toEqual({ operationId: 'notFound' });
      expect(dummyHandlers['notFound']).toBeCalledWith('param4', 'param5');
    });

    test('handles a 501 for not implemented endpoint DELETE /pets/1', async () => {
      const res = await api.handleRequest({ method: 'DELETE', path: '/pets/1', headers }, 'param5', 'param6');
      expect(res).toEqual({ operationId: 'notImplemented' });
      expect(dummyHandlers['notImplemented']).toBeCalledWith('param5', 'param6');
    });

    test('handles GET /pets/ with trailing slash', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/', headers }, 'param6', 'param7');
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalledWith('param6', 'param7');
    });

    test('handles GET /pets/?limit=10 with query string', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/?limit=10', headers }, 'param7', 'param8');
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalledWith('param7', 'param8');
    });

    test('handles GET pets with no leading slash', async () => {
      const res = await api.handleRequest({ method: 'GET', path: 'pets', headers }, 'param8', 'param9');
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalledWith('param8', 'param9');
    });
  });

  describe('.handleRequest withContext=true', async () => {
    const dummyHandlers: { [operationId: string]: jest.Mock<any> } = {};
    const dummyHandler = (operationId: string) => (dummyHandlers[operationId] = jest.fn(() => ({ operationId })));
    const api = new OpenAPIBackend({
      definition,
      withContext: true,
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
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets', headers });
      expect(contextArg.operation.operationId).toEqual('getPets');
      expect(contextArg.validation.errors).toBeFalsy();
    });

    test('handles GET /pets/?limit=10 with query string and passes context', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/?limit=10', headers });
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalled();

      const contextArg = dummyHandlers['getPets'].mock.calls.slice(-1)[0][0];
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets', query: { limit: '10' }, headers });
      expect(contextArg.operation.operationId).toEqual('getPets');
      expect(contextArg.validation.errors).toBeFalsy();
    });
  });

  describe('.handleRequest postResponseHandler', async () => {
    const dummyHandlers: { [operationId: string]: jest.Mock<any> } = {};
    const dummyHandler = (operationId: string) => (dummyHandlers[operationId] = jest.fn(() => ({ operationId })));
    const api = new OpenAPIBackend({
      definition,
      withContext: true,
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
      const postResponseHandler = jest.fn((c: Context) => c.response);
      await api.register({ postResponseHandler });

      const res = await api.handleRequest({ method: 'GET', path: '/', headers });
      expect(dummyHandlers['apiRoot']).toBeCalled();
      expect(postResponseHandler).toBeCalled();
      expect(res).toEqual({ operationId: 'apiRoot' });

      const contextArg = postResponseHandler.mock.calls.slice(-1)[0][0];
      expect(contextArg.response).toMatchObject({ operationId: 'apiRoot' });
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/', headers });
    });

    test('handles GET /pets and passes response to postResponseHandler', async () => {
      const postResponseHandler = jest.fn((c: Context) => c.response);
      await api.register({ postResponseHandler });

      const res = await api.handleRequest({ method: 'GET', path: '/pets', headers });
      expect(dummyHandlers['getPets']).toBeCalled();
      expect(postResponseHandler).toBeCalled();
      expect(res).toEqual({ operationId: 'getPets' });

      const contextArg = postResponseHandler.mock.calls.slice(-1)[0][0];
      expect(contextArg.response).toMatchObject({ operationId: 'getPets' });
      expect(contextArg.request).toMatchObject({ method: 'get', path: '/pets', headers });
    });

    test('handles GET /pets and allows postResponseHandler to intercept response', async () => {
      const postResponseHandler = jest.fn(() => ({ you: 'have been intercepted' }));
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
