import OpenAPIBackend from '../src/index';
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
          responses: {
            PetsListWithExample: {
              description: 'ok',
              content: {
                'application/json': {
                  example: {
                    value: [exampleGarfield],
                  },
                },
              },
            },
            PetsListWithExamplesArray: {
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
            PetsListWithResponseSchema: {
              description: 'ok',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
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
        200: { $ref: '#/components/responses/PetsListWithExample' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield]);
    });

    test('mocks getPets with examples array', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/PetsListWithExamplesArray' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield, exampleOdey]);
    });

    test('mocks getPets with response schema', async () => {
      const { paths } = api.inputDocument as OpenAPIV3.Document;
      paths['/pets'].get.responses = {
        200: { $ref: '#/components/responses/PetsListWithResponseSchema' },
      };
      await api.init();
      const mock = api.mockResponseForOperation('getPets');
      expect(mock).toMatchObject([exampleGarfield]);
    });
  });
});
