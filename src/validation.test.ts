import { OpenAPIRequestValidator } from './index';
import { OpenAPIV3 } from 'openapi-types';
import { SchemaLike } from 'mock-json-schema';

const headers = { accept: 'application/json' };

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

describe('OpenAPIRequestValidator', () => {
  describe('.validateRequest', () => {
    describe('path params in path base object', () => {
      const validator = new OpenAPIRequestValidator({
        definition: {
          ...meta,
          paths: {
            '/pets/{id}': {
              get: {
                operationId: 'getPetById',
                responses,
              },
              delete: {
                operationId: 'deletePetById',
                responses,
              },
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'integer',
                    minimum: 0,
                  },
                },
              ],
            },
          },
        },
      });

      test('passes validation for GET /pets/1', async () => {
        const valid = validator.validateRequest({ path: '/pets/1', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for GET /pets/NaN', async () => {
        const valid = validator.validateRequest({ path: '/pets/NaN', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for GET /pets/1.1', async () => {
        const valid = validator.validateRequest({ path: '/pets/1.1', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for GET /pets/-1', async () => {
        const valid = validator.validateRequest({ path: '/pets/-1', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('passes validation for DELETE /pets/1', async () => {
        const valid = validator.validateRequest({ path: '/pets/1', method: 'delete', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for DELETE /pets/NaN', async () => {
        const valid = validator.validateRequest({ path: '/pets/NaN', method: 'delete', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for DELETE /pets/1.1', async () => {
        const valid = validator.validateRequest({ path: '/pets/1.1', method: 'delete', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for DELETE /pets/-1', async () => {
        const valid = validator.validateRequest({ path: '/pets/-1', method: 'delete', headers });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('path params in operation object', () => {
      const validator = new OpenAPIRequestValidator({
        definition: {
          ...meta,
          paths: {
            '/pets/{id}': {
              get: {
                operationId: 'getPetById',
                responses,
                parameters: [
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: {
                      type: 'integer',
                      minimum: 0,
                    },
                  },
                ],
              },
            },
          },
        },
      });

      test('passes validation for GET /pets/1', async () => {
        const valid = validator.validateRequest({ path: '/pets/1', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for GET /pets/NaN', async () => {
        const valid = validator.validateRequest({ path: '/pets/NaN', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('query params in path base object', () => {
      const validator = new OpenAPIRequestValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPets',
                responses,
              },
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  schema: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 100,
                  },
                },
                {
                  name: 'offset',
                  in: 'query',
                  schema: {
                    type: 'integer',
                    minimum: 0,
                  },
                },
              ],
            },
          },
        },
      });

      test('passes validation for GET /pets', async () => {
        const valid = validator.validateRequest({ path: '/pets', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for GET /pets?limit=10', async () => {
        const valid = validator.validateRequest({ path: '/pets?limit=10', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for GET /pets?offset=10', async () => {
        const valid = validator.validateRequest({ path: '/pets?offset=10', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for GET /pets?limit=10&offset=10', async () => {
        const valid = validator.validateRequest({ path: '/pets?limit=10&offset=10', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for GET /pets?limit=NaN', async () => {
        const valid = validator.validateRequest({ path: '/pets?limit=NaN', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for GET /pets?limit=-1', async () => {
        const valid = validator.validateRequest({ path: '/pets?limit=-1', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for GET /pets?limit=999999999', async () => {
        const valid = validator.validateRequest({ path: '/pets?limit=999999999', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for GET /pets?unknownparam=1', async () => {
        const valid = validator.validateRequest({ path: '/pets?unknownparam=1', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('query params in operation object', () => {
      const validator = new OpenAPIRequestValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPets',
                responses,
                parameters: [
                  {
                    name: 'q',
                    in: 'query',
                    schema: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                  {
                    name: 'limit',
                    in: 'query',
                    schema: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 100,
                    },
                  },
                ],
              },
            },
          },
        },
      });

      test('passes validation for GET /pets?limit=10', async () => {
        const valid = validator.validateRequest({ path: '/pets?limit=10', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for GET /pets?limit=10&limit=20', async () => {
        const valid = validator.validateRequest({ path: '/pets?unknownparam=1', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });

      test('passes validation for GET /pets?q=search', async () => {
        const valid = validator.validateRequest({ path: '/pets?q=search', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for GET /pets?q=search1&q=search2', async () => {
        const valid = validator.validateRequest({ path: '/pets?q=search1&q=search2', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for GET /pets?q[]=search1&q[]=search2', async () => {
        const valid = validator.validateRequest({ path: '/pets?q[]=search1&q[]=search2', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for GET /pets?q[0]=search1&q[1]=search2', async () => {
        const valid = validator.validateRequest({ path: '/pets?q[0]=search1&q[1]=search2', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for GET /pets?unknownparam=1', async () => {
        const valid = validator.validateRequest({ path: '/pets?unknownparam=1', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('headers', () => {
      const validator = new OpenAPIRequestValidator({
        definition: {
          ...meta,
          paths: {
            '/secret': {
              get: {
                operationId: 'secretWithApiKey',
                responses,
              },
              parameters: [
                {
                  name: 'x-api-key',
                  in: 'header',
                  schema: {
                    type: 'string',
                    pattern: '^[A-Za-z0-9]{8,16}$',
                  },
                  required: true,
                },
              ],
            },
          },
        },
      });

      test('passes validation for GET /secret, x-api-key:abcd0123', async () => {
        const valid = validator.validateRequest({
          path: '/secret',
          method: 'get',
          headers: { ...headers, 'x-api-key': 'abcd0123' },
        });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for GET /secret, x-api-key:123', async () => {
        const valid = validator.validateRequest({
          path: '/secret',
          method: 'get',
          headers: { ...headers, 'x-api-key': '123' },
        });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for GET /secret, x-api-key:äääöööååå', async () => {
        const valid = validator.validateRequest({
          path: '/secret',
          method: 'get',
          headers: { ...headers, 'x-api-key': 'äääöööååå' },
        });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('request payloads', () => {
      const petSchema: SchemaLike = {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
          },
          age: {
            type: 'integer',
          },
        },
        required: ['name'],
      };

      const validator = new OpenAPIRequestValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              post: {
                operationId: 'createPet',
                responses,
                requestBody: {
                  content: {
                    'application/json': {
                      schema: petSchema,
                    },
                  },
                },
              },
              put: {
                operationId: 'replacePet',
                responses,
                requestBody: {
                  content: {
                    'application/json': {
                      schema: petSchema,
                    },
                    'application/xml': {
                      example: '<Pet><name>string</name></Pet>',
                    },
                  },
                },
              },
            },
          },
        },
      });

      test('passes validation for POST /pets with full object', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            name: 'Garfield',
            age: 40,
          },
        });
        expect(valid.errors).toBeFalsy();
      });

      test('passes validation for POST /pets with name only', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            name: 'Garfield',
          },
        });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for POST /pets with age only', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            age: 40,
          },
        });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for POST /pets with additional property', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            name: 'Garfield',
            hello: 'world',
          },
        });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for POST /pets with empty payload', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
        });
        expect(valid.errors).toHaveLength(1);
      });

      test('fails validation for non-json data when the only media type defined is application/json', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          body: '<XML>',
          headers,
        });
        expect(valid.errors).toHaveLength(2);
        expect(valid.errors[0].keyword).toBe('parse');
      });

      test('allows non-json data when application/json is not the only allowed media type', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'put',
          body: '<XML>',
          headers,
        });
        expect(valid.errors).toBeFalsy();
      });
    });
  });
});
