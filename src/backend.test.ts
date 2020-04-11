import * as path from 'path';
import { OpenAPIBackend } from './backend';
import { OpenAPIV3 } from 'openapi-types';

const testsDir = path.join(__dirname, '..', '__tests__');
const examplePetAPIJSON = path.join(testsDir, 'resources', 'example-pet-api.openapi.json');
const examplePetAPIYAML = path.join(testsDir, 'resources', 'example-pet-api.openapi.yml');

const responses: OpenAPIV3.ResponsesObject = {
  200: { description: 'ok' },
};

const meta = {
  openapi: '3.0.0',
  info: {
    title: 'api',
    version: '1.0.0',
  },
};

const pathId: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: {
    type: 'integer',
  },
};

describe('OpenAPIBackend', () => {
  const definition: OpenAPIV3.Document = {
    ...meta,
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

  test('can be initalised with a valid OpenAPI document as JS Object', async () => {
    // @TODO: read a complex document with as many features as possible here
    const api = new OpenAPIBackend({ definition, strict: true });
    await api.init();
    expect(api.initalized).toEqual(true);
    expect(api.router.getOperations()).toHaveLength(8);
  });

  test('can be initalised using a valid YAML file', async () => {
    // @TODO: read a complex document with as many features as possible here
    const api = new OpenAPIBackend({ definition: examplePetAPIYAML, strict: true });
    await api.init();
    expect(api.initalized).toEqual(true);
    expect(api.router.getOperations()).toHaveLength(8);
  });

  test('can be initalised using a valid JSON file', async () => {
    // @TODO: read a complex document with as many features as possible here
    const api = new OpenAPIBackend({ definition: examplePetAPIJSON, strict: true });
    await api.init();
    expect(api.initalized).toEqual(true);
    expect(api.router.getOperations()).toHaveLength(8);
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
    expect(api.router.getOperations()).toHaveLength(0);
  });

  describe('.register', () => {
    const api = new OpenAPIBackend({ definition });
    beforeAll(() => api.init());

    const dummyHandler = jest.fn();

    test('registers a single handler with .registerHandler', async () => {
      api.registerHandler('getPets', dummyHandler);
      expect(api.handlers['getPets']).toBe(dummyHandler);
    });

    test('registers a single handler with .register', async () => {
      api.register('getPets', dummyHandler);
      expect(api.handlers['getPets']).toBe(dummyHandler);
    });

    test('emits a warning when registering a handler for unknown operationId not in strict mode', async () => {
      api.strict = false;
      const warn = console.warn;
      console.warn = jest.fn();
      api.register('getHumans', dummyHandler);
      expect(console.warn).toBeCalledTimes(1);
      expect(api.handlers['getHumans']).toBe(dummyHandler);
      console.warn = warn; // reset console.warn
    });

    test('refuses to register a handler for unknown operationId when in strict mode', async () => {
      api.strict = true;
      expect(() => api.register('getAliens', dummyHandler)).toThrowError();
      expect(api.handlers['getAliens']).not.toBe(dummyHandler);
    });

    test('registers multiple handlers with .register', async () => {
      api.register({
        getPetById: dummyHandler,
        createPet: dummyHandler,
        notFound: dummyHandler,
        methodNotAllowed: dummyHandler,
      });
      expect(api.handlers['getPetById']).toBe(dummyHandler);
      expect(api.handlers['createPet']).toBe(dummyHandler);
      expect(api.handlers['notFound']).toBe(dummyHandler);
      expect(api.handlers['methodNotAllowed']).toBe(dummyHandler);
    });
  });

  describe('.handleRequest', () => {
    const api = new OpenAPIBackend({ definition });

    test('handles GET /pets request with getPets handler', async () => {
      const dummyHandler = jest.fn(() => 'dummyResponse');
      api.register('getPets', dummyHandler);
      await api.init();

      const request = {
        method: 'get',
        path: '/pets',
        headers: {},
      };

      const res = await api.handleRequest(request);
      expect(dummyHandler).toBeCalledTimes(1);
      expect(res).toBe('dummyResponse');
    });

    test('handles GET /unknown request with notFound handler', async () => {
      const dummyHandler = jest.fn(() => 'dummyResponse');
      api.register('notFound', dummyHandler);
      await api.init();

      const request = {
        method: 'get',
        path: '/unknown',
        headers: {},
      };
      const res = await api.handleRequest(request);
      expect(dummyHandler).toBeCalledTimes(1);
      expect(res).toBe('dummyResponse');
    });

    test('handles DELETE /pets request with methodNotAllowed handler', async () => {
      const dummyHandler = jest.fn(() => 'dummyResponse');
      api.register('methodNotAllowed', dummyHandler);
      await api.init();

      const request = {
        method: 'delete',
        path: '/pets',
        headers: {},
      };
      const res = await api.handleRequest(request);
      expect(dummyHandler).toBeCalledTimes(1);
      expect(res).toBe('dummyResponse');
    });
  });

  describe('.mockResponseForOperation', () => {
    const exampleGarfield = {
      id: 1,
      name: 'Garfield',
    };
    const exampleGarfieldWithTag = {
      id: 1,
      tag: 'Lost',
    };
    const exampleOdey = {
      id: 2,
      name: 'Odey',
    };

    const mockDefinition = {
      ...meta,
      paths: {
        '/pets': {
          get: {
            operationId: 'getPets',
            responses: {
              200: { $ref: '#/components/responses/PetsListWithExample' },
            },
          },
          post: {
            operationId: 'createPet',
            responses: {
              201: { $ref: '#/components/responses/SinglePetWithResponseSchema' },
            },
          },
        },
      },
      components: {
        schemas: {
          PetWithName: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
                minimum: 1,
              },
              name: {
                type: 'string',
                example: 'Garfield',
              },
            },
          },
          PetWithTag: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
                minimum: 1,
              },
              tag: {
                type: 'string',
                example: 'Lost',
              },
            },
          },
        },
        responses: {
          SinglePetWithResponseSchema: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PetWithName',
                },
              },
            },
          },
          SimplePetsListWithExample: {
            description: 'ok',
            content: {
              'application/json': {
                example: [exampleGarfield],
              },
            },
          },
          SimplePetsListWithExamplesArray: {
            description: 'ok',
            content: {
              'application/json': {
                examples: {
                  garfield: {
                    value: [exampleGarfield, exampleOdey],
                  },
                },
              },
            },
          },
          SimplePetsListWithResponseSchema: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/PetWithName',
                  },
                },
              },
            },
          },
          AllOfPetsListWithResponseSchema: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    allOf: [{ $ref: '#/components/schemas/PetWithName' }, { $ref: '#/components/schemas/PetWithTag' }],
                  },
                },
              },
            },
          },
          AnyOfPetsListWithResponseSchema: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    anyOf: [{ $ref: '#/components/schemas/PetWithName' }, { $ref: '#/components/schemas/PetWithTag' }],
                  },
                },
              },
            },
          },
          OneOfPetsListWithResponseSchema: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    oneOf: [{ $ref: '#/components/schemas/PetWithName' }, { $ref: '#/components/schemas/PetWithTag' }],
                  },
                },
              },
            },
          },
        },
      },
    };

    const api = new OpenAPIBackend({ definition: mockDefinition as OpenAPIV3.Document });

    test('mocks getPets with example object', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/SimplePetsListWithExample' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('getPets');
      expect(status).toBe(200);
      expect(mock).toMatchObject([exampleGarfield]);
    });

    test('mocks getPets with examples array', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/SimplePetsListWithExamplesArray' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('getPets');
      expect(status).toBe(200);
      expect(mock).toMatchObject([exampleGarfield, exampleOdey]);
    });

    test('mocks getPets with response schema', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/SimplePetsListWithResponseSchema' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('getPets');
      expect(status).toBe(200);
      expect(mock).toMatchObject([exampleGarfield]);
    });

    test('mocks getPets with response schema containing allOf', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/AnyOfPetsListWithResponseSchema' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('getPets');
      expect(status).toBe(200);
      expect(mock).toMatchObject([exampleGarfield, exampleGarfieldWithTag]);
    });

    test('mocks getPets with response schema containing anyOf', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/AnyOfPetsListWithResponseSchema' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('getPets');
      expect(status).toBe(200);
      expect(mock).toMatchObject([exampleGarfield, exampleGarfieldWithTag]);
    });

    test('mocks getPets with response schema containing oneOf', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/OneOfPetsListWithResponseSchema' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('getPets');
      expect(status).toBe(200);
      expect(mock).toMatchObject([exampleGarfield]);
    });

    test('mocks createPet with response schema', async () => {
      const { paths } = mockDefinition;
      paths['/pets'].post.responses = {
        201: { $ref: '#/components/responses/SinglePetWithResponseSchema' },
      };
      await api.init();
      const { status, mock } = api.mockResponseForOperation('createPet');
      expect(status).toBe(201);
      expect(mock).toMatchObject(exampleGarfield);
    });
  });
});
