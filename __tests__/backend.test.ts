import OpenAPIBackend from '../src/index';
import { OpenAPIV3 } from 'openapi-types';

const responses = {
  200: { description: 'ok' },
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
    },
    '/pets/{id}/owner': {
      get: {
        operationId: 'getOwnerByPetId',
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
  test('can be initalised with a valid OpenAPI document', async () => {
    // @TODO: read complex document with as many features as possible here
    const opts = { document };
    expect(new OpenAPIBackend(opts)).toBeInstanceOf(OpenAPIBackend);
  });

  test('throws an error when initalised with an invalid document', async () => {
    const opts: any = { document: { invalid: 'not openapi' } };
    expect(() => new OpenAPIBackend(opts)).toThrowError();
  });

  describe('.matchOperation', () => {
    test('matches GET /pets', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets', 'get');
      expect(operationId).toEqual('getPets');
    });

    test('matches POST /pets', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets', 'post');
      expect(operationId).toEqual('createPet');
    });

    test('matches GET /pets/{id}', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets/1', 'get');
      expect(operationId).toEqual('getPetById');
    });

    test('matches PUT /pets/{id}', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets/1', 'put');
      expect(operationId).toEqual('replacePetById');
    });

    test('matches PATCH /pets/{id}', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets/1', 'patch');
      expect(operationId).toEqual('updatePetById');
    });

    test('matches DELETE /pets/{id}', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets/1', 'delete');
      expect(operationId).toEqual('deletePetById');
    });

    test('matches GET /pets/{id}/owner', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets/1/owner', 'get');
      expect(operationId).toEqual('getOwnerByPetId');
    });

    test('matches GET /pets/meta', async () => {
      const api = new OpenAPIBackend({ document });
      const { operationId } = api.matchOperation('/pets/meta', 'get');
      expect(operationId).toEqual('getPetsMeta');
    });
  });
});
