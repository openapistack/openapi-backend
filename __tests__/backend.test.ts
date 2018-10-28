import path from 'path';
import OpenAPIBackend from '../src/index';
import { OpenAPIV3 } from 'openapi-types';

const examplePetAPIJSON = path.join(__dirname, 'resources', 'example-pet-api.openapi.json');
const examplePetAPIYAML = path.join(__dirname, 'resources', 'example-pet-api.openapi.yml');

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

const definition: OpenAPIV3.Document = {
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
      parameters: [pathId],
    },
    '/pets/{id}/owner': {
      get: {
        operationId: 'getOwnerByPetId',
        responses,
      },
      parameters: [pathId],
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
  test('can be initalised with a valid OpenAPI document as JS Object', async () => {
    // @TODO: read a complex document with as many features as possible here
    const api = new OpenAPIBackend({ definition, strict: true });
    await api.init();
    expect(api.initalized).toEqual(true);
  });

  test('can be initalised using a valid YAML file', async () => {
    // @TODO: read a complex document with as many features as possible here
    const api = new OpenAPIBackend({ definition: examplePetAPIYAML, strict: true });
    await api.init();
    expect(api.initalized).toEqual(true);
  });

  test('can be initalised using a valid JSON file', async () => {
    // @TODO: read a complex document with as many features as possible here
    const api = new OpenAPIBackend({ definition: examplePetAPIJSON, strict: true });
    await api.init();
    expect(api.initalized).toEqual(true);
  });

  test('throws an error when initalised with an invalid document in strict mode', async () => {
    const invalid: any = { invalid: 'not openapi' };
    const api = new OpenAPIBackend({ definition: invalid, strict: true });
    await expect(api.init()).rejects.toThrowError();
  });

  test('emits a warning when initalised with an invalid OpenAPI document not in strict mode', async () => {
    const invalid: any = { invalid: 'not openapi' };
    const warn = console.warn;
    console.warn = jest.fn();
    const api = new OpenAPIBackend({ definition: invalid, strict: false });
    await api.init();
    expect(console.warn).toBeCalledTimes(1);
    console.warn = warn; // reset console.warn
  });

  describe('.registerHandler', () => {
    const api = new OpenAPIBackend({ definition });
    beforeAll(() => api.init());

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
});
