import OpenAPIBackend from './index';
import { OpenAPIV3 } from 'openapi-types';

const meta = {
  openapi: '3.0.0',
  info: {
    title: 'api',
    version: '1.0.0',
  },
};

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

describe('Mocking', () => {
  describe('mockResponseForOperation', () => {
    const api = new OpenAPIBackend({
      definition: {
        ...meta,
        paths: {
          '/pets': {
            get: {
              operationId: 'getPets',
              responses: {
                200: { $ref: '#/components/responses/PetsListWithExample' },
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
            SimplePetsListWithExample: {
              description: 'ok',
              content: {
                'application/json': {
                  example: {
                    value: [exampleGarfield],
                  },
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
                      allOf: [
                        { $ref: '#/components/schemas/PetWithName' },
                        { $ref: '#/components/schemas/PetWithTag' },
                      ],
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
                      anyOf: [
                        { $ref: '#/components/schemas/PetWithName' },
                        { $ref: '#/components/schemas/PetWithTag' },
                      ],
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
                      oneOf: [
                        { $ref: '#/components/schemas/PetWithName' },
                        { $ref: '#/components/schemas/PetWithTag' },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    test('mocks getPets with example object', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/SimplePetsListWithExample' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield]);
    });

    test('mocks getPets with examples array', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/SimplePetsListWithExamplesArray' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield, exampleOdey]);
    });

    test('mocks getPets with response schema', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/SimplePetsListWithResponseSchema' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield]);
    });

    test('mocks getPets with response schema containing allOf', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/AnyOfPetsListWithResponseSchema' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield, exampleGarfieldWithTag]);
    });

    test('mocks getPets with response schema containing anyOf', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/AnyOfPetsListWithResponseSchema' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield, exampleGarfieldWithTag]);
    });

    test('mocks getPets with response schema containing oneOf', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/OneOfPetsListWithResponseSchema' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield]);
    });
  });
});
