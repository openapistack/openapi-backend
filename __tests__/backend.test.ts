import OpenAPIBackend from '../src/index';
import { OpenAPIV3 } from 'openapi-types';

const headers = {
  accept: 'application/json',
};

const responses: OpenAPIV3.ResponsesObject = {
  200: { description: 'ok' },
};

const pathId: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: {
    type: 'string',
  },
};

const document: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: {
    title: 'api',
    version: '1.0.0',
  },
  paths: {
    '/pets': {
      get: {
        operationId: 'getPets',
        responses,
      },
      post: {
        operationId: 'createPet',
        responses,
      },
    },
    '/pets/{id}': {
      get: {
        operationId: 'getPetById',
        parameters: [pathId],
        responses,
      },
      put: {
        operationId: 'replacePetById',
        parameters: [pathId],
        responses,
      },
      patch: {
        operationId: 'updatePetById',
        parameters: [pathId],
        responses,
      },
      delete: {
        operationId: 'deletePetById',
        parameters: [pathId],
        responses,
      },
    },
    '/pets/{id}/owner': {
      get: {
        operationId: 'getOwnerByPetId',
        parameters: [pathId],
        responses,
      },
    },
    '/pets/meta': {
      get: {
        operationId: 'getPetsMeta',
        responses,
      },
    },
  },
};

describe('OpenAPIBackend', () => {
  test('can be initalised with a valid OpenAPI document in strict mode', async () => {
    // @TODO: read a complex document with as many features as possible here
    const opts = { document, strict: true };
    expect(new OpenAPIBackend(opts)).toBeInstanceOf(OpenAPIBackend);
  });

  test('throws an error when initalised with an invalid document in strict mode', async () => {
    const opts: any = { document: { invalid: 'not openapi' }, strict: true };
    expect(() => new OpenAPIBackend(opts)).toThrowError();
  });

  test('emits a warning with an invalid OpenAPI document not in strict mode', async () => {
    const opts: any = { document: { invalid: 'not openapi' } };
    const warn = console.warn;
    console.warn = jest.fn();
    expect(new OpenAPIBackend(opts)).toBeInstanceOf(OpenAPIBackend);
    expect(console.warn).toBeCalledTimes(1);
    console.warn = warn; // reset console.warn
  });

  describe('.matchOperation', () => {
    const api = new OpenAPIBackend({ document });
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

    test('matches GET /pets/meta', async () => {
      const { operationId } = api.matchOperation({ path: '/pets/meta', method: 'get', headers });
      expect(operationId).toEqual('getPetsMeta');
    });
  });

  describe('.registerHandler', () => {
    const api = new OpenAPIBackend({ document });
    const dummyHandler = jest.fn();

    test('registers a handler with .registerHandler', async () => {
      api.registerHandler('getPets', dummyHandler);
      expect(api.handlers['getPets']).toBe(dummyHandler);
    });

    test('emits a warning when registering a handler for unknown operationId not in strict mode', async () => {
      api.strict = false;
      const warn = console.warn;
      console.warn = jest.fn();
      api.registerHandler('getHumans', dummyHandler);
      expect(console.warn).toBeCalledTimes(1);
      expect(api.handlers['getHumans']).toBe(dummyHandler);
      console.warn = warn; // reset console.warn
    });

    test('refuses to register a handler for unknown operationId when in strict mode', async () => {
      api.strict = true;
      expect(() => api.registerHandler('getAliens', dummyHandler)).toThrowError();
      expect(api.handlers['getAliens']).not.toBe(dummyHandler);
    });

    test('registers multiple handlers with .register', async () => {
      api.register({
        getPetById: dummyHandler,
        createPet: dummyHandler,
        notFound: dummyHandler,
      });
      expect(api.handlers['getPetById']).toBe(dummyHandler);
      expect(api.handlers['createPet']).toBe(dummyHandler);
      expect(api.handlers['notFound']).toBe(dummyHandler);
    });
  });

  describe('.handleRequest', () => {
    const dummyHandlers: { [operationId: string]: jest.Mock<any> } = {};
    const dummyHandler = (operationId: string) => (dummyHandlers[operationId] = jest.fn(() => ({ operationId })));
    const api = new OpenAPIBackend({
      document,
      handlers: {
        getPets: dummyHandler('getPets'),
        getPetById: dummyHandler('getPetById'),
        createPet: dummyHandler('createPet'),
        updatePetById: dummyHandler('updatePetById'),
        notImplemented: dummyHandler('notImplemented'),
        notFound: dummyHandler('notFound'),
      },
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

    test('handles GET /pets/?hello=1 with query string', async () => {
      const res = await api.handleRequest({ method: 'GET', path: '/pets/?hello=1', headers }, 'param7', 'param8');
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalledWith('param7', 'param8');
    });

    test('handles GET pets with no leading slash', async () => {
      const res = await api.handleRequest({ method: 'GET', path: 'pets', headers }, 'param8', 'param9');
      expect(res).toEqual({ operationId: 'getPets' });
      expect(dummyHandlers['getPets']).toBeCalledWith('param8', 'param9');
    });
  });
});
