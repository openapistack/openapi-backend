import Ajv from 'ajv';
import { OpenAPIRouter, OpenAPIValidator } from './index';
import { OpenAPIV3_1 } from 'openapi-types';
import { SchemaLike } from 'mock-json-schema';
import { SetMatchType } from './backend';
import * as path from 'path';
import * as _ from 'lodash';
import { dereference } from './refparser';

const testsDir = path.join(__dirname, '..', '__tests__');
const circularRefPath = path.join(testsDir, 'resources', 'refs.openapi.json');

const headers = { accept: 'application/json' };

const meta: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info: {
    title: 'api',
    version: '1.0.0',
  },
  paths: {},
};

const validBTree = {
  left: {
    left: null,
    right: null,
    value: 0,
  },
  right: {
    left: null,
    right: {
      left: null,
      right: null,
      value: 3,
    },
    value: 2,
  },
  value: 1,
};
const invalidBTree = {
  left: null,
  right: null,
  value: 'not a number',
};

let circularRefDefinition: any;
beforeAll(async () => {
  circularRefDefinition = await dereference(circularRefPath);
});

describe.each([{}, { lazyCompileValidators: true }])('OpenAPIValidator with opts %j', (constructorOpts) => {
  describe('.validateRequest', () => {
    describe('path params in path base object', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets/{id}': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
              },
              delete: {
                operationId: 'deletePetById',
                responses: { 200: { description: 'ok' } },
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
        ...constructorOpts,
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
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets/{id}': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
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
        ...constructorOpts,
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

    describe('path params with custom apiRoot', () => {
      const definition: OpenAPIV3_1.Document = {
        ...meta,
        paths: {
          '/pets/{id}': {
            get: {
              operationId: 'getPetById',
              responses: { 200: { description: 'ok' } },
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
      };

      const validator = new OpenAPIValidator({
        definition,
        router: new OpenAPIRouter({ definition, apiRoot: '/v1' }),
        ...constructorOpts,
      });

      test('passes validation for GET /v1/pets/1', async () => {
        const valid = validator.validateRequest({ path: '/v1/pets/1', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
    });

    describe('query params in path base object', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPets',
                responses: { 200: { description: 'ok' } },
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
        ...constructorOpts,
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
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPets',
                responses: { 200: { description: 'ok' } },
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
        ...constructorOpts,
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

    describe('passes validation for free-form query parameters', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
                parameters: [
                  {
                    name: 'freeFormInteger',
                    in: 'query',
                    schema: {
                      type: 'object',
                      // Sets additionalProperties to the schema of the desired free-form query parameters.
                      additionalProperties: {
                        type: 'integer',
                      },
                    },
                    style: 'form',
                  },
                  {
                    name: 'freeFormNumber',
                    in: 'query',
                    schema: {
                      type: 'object',
                      // Sets additionalProperties to the schema of the desired free-form query parameters.
                      additionalProperties: {
                        type: 'number',
                      },
                    },
                    style: 'form',
                  },
                ],
              },
            },
          },
        },
        ...constructorOpts,
      });

      test('passes validation for free-form schema of integer', async () => {
        const valid = validator.validateRequest({ path: '/pets?arbitraryKeyInteger=4', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test('passes validation for free-form schema of number', async () => {
        const valid = validator.validateRequest({ path: '/pets?arbitraryKeyNumber=4.7', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test(`fails validation for free-form value that's not one of the specified schemas`, async () => {
        const valid = validator.validateRequest({ path: '/pets?arbitraryKeyString=string', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('query params with exploded objects', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
                parameters: [
                  {
                    name: 'query-parameter',
                    in: 'query',
                    schema: {
                      type: 'object',
                      properties: {
                        breed: {
                          type: 'string'
                        },
                        age: {
                          type: 'integer'
                        }
                      },
                      additionalProperties: false,
                    },
                    explode: true,
                    style: 'form',
                  },
                ],
              },
            },
          },
        },
        ...constructorOpts,
      });

      test('passes validation for properties of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?age=4&breed=pug', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test(`fails validation for additional properties`, async () => {
        const valid = validator.validateRequest({ path: '/pets?query-parameter=something', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
    });

    describe('query params with exploded oneOf objects', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
                parameters: [
                  {
                    name: 'query-parameter',
                    in: 'query',
                    schema: {
                      oneOf: [{
                        type: 'object',
                        properties: {
                          breed: {
                            type: 'string'
                          },
                          age: {
                            type: 'integer'
                          }
                        },
                        additionalProperties: false,
                      },
                        {
                          type: 'object',
                          properties: {
                            name: {
                              type: 'string'
                            }
                          },
                          additionalProperties: false,
                        }
                      ],
                    },
                    explode: true,
                    style: 'form',
                  },
                ],
              },
            },
          },
        },
        ...constructorOpts,
      });

      test('passes validation for properties of type A of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?age=4&breed=pug', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test('passes validation for properties of type B of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?name=spot', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test(`fails validation for additional properties`, async () => {
        const valid = validator.validateRequest({ path: '/pets?query-parameter=something', method: 'get', headers });
        expect(valid.errors).toHaveLength(3);
      });
    })

    describe('query params with exploded allOf objects', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
                parameters: [
                  {
                    name: 'filter',
                    in: 'query',
                    schema: {
                      allOf: [{
                        type: 'object',
                        additionalProperties: true,
                        properties: {
                          from: { type: 'number' },
                          take: { type: 'string' },
                        },
                        required: ['from', 'take']
                      }, {
                        type: 'object',
                        additionalProperties: true,
                        properties: {
                          from: { type: 'number' },
                          to: { type: 'number' },
                        },
                        required: ['from', 'to']
                      }]
                    },
                    explode: true,
                    style: 'form',
                  },
                ],
              },
            },
          },
        },
        ...constructorOpts,
      });

      test('passes validation for properties of type A and B of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5&to=4&take=all', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test('fails validation for properties of type A of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5&take=all', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
      test('fails validation for properties of type B of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5&to=3', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
      test(`fails validation for additional properties`, async () => {
        const valid = validator.validateRequest({ path: '/pets?query-parameter=something', method: 'get', headers });
        expect(valid.errors).toHaveLength(1);
      });
    })

    describe('query params with exploded anyOf objects', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/pets': {
              get: {
                operationId: 'getPetById',
                responses: { 200: { description: 'ok' } },
                parameters: [
                  {
                    name: 'filter',
                    in: 'query',
                    schema: {
                      anyOf: [{
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          from: { type: 'number' },
                          take: { type: 'string' },
                        },
                        required: ['from', 'take']
                      }, {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          from: { type: 'number' },
                          to: { type: 'number' },
                        },
                        required: ['from', 'to']
                      }, {
                        type: 'object',
                        additionalProperties: true,
                        properties: {
                          from: { type: 'number' },
                        },
                        required: ['from'],
                      }]
                    },
                    explode: true,
                    style: 'form',
                  },
                ],
              },
            },
          },
        },
        ...constructorOpts,
      });

      test('passes validation for properties of type A, B and C of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5&to=4&take=all', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test('passes validation for properties of type A and C of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5&take=all', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test('passes validation for properties of type B and C of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5&to=3', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test('passes validation for properties of C of the query object', async () => {
        const valid = validator.validateRequest({ path: '/pets?from=5', method: 'get', headers });
        expect(valid.errors).toBeFalsy();
      });
      test(`fails validation for additional properties`, async () => {
        const valid = validator.validateRequest({ path: '/pets?extra=something', method: 'get', headers });
        expect(valid.errors).toHaveLength(4);
      });
    })

    describe('headers', () => {
      const validator = new OpenAPIValidator({
        definition: {
          ...meta,
          paths: {
            '/secret': {
              get: {
                operationId: 'secretWithApiKey',
                responses: { 200: { description: 'ok' } },
              },
              parameters: [
                {
                  name: 'X-Api-Key',
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
        ...constructorOpts,
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
      let validator: OpenAPIValidator;
      const petSchema: OpenAPIV3_1.SchemaObject = {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
          },
          age: {
            type: ['integer', 'null'],
          },
          unknownValue: {}, // this property should accept `any` value, including null
        },
        required: ['name'],
      };
      beforeAll(() => {
        validator = new OpenAPIValidator({
          definition: {
            ...meta,
            paths: {
              '/pets': {
                post: {
                  operationId: 'createPet',
                  responses: { 200: { description: 'ok' } },
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
                  responses: { 200: { description: 'ok' } },
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
              ...circularRefDefinition.paths,
            },
            ...constructorOpts,
          },
        });
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

      test('passes validation for POST /trees with tree of numbers (recursive structure)', async () => {
        const valid = validator.validateRequest({
          path: '/trees',
          method: 'post',
          headers,
          body: validBTree,
        });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for POST /trees with tree of strings (recursive structure)', async () => {
        const valid = validator.validateRequest({
          path: '/trees',
          method: 'post',
          headers,
          body: invalidBTree,
        });
        expect(valid.errors).toHaveLength(1);
      });

      test('passes validation for POST /pets with nullable age', async () => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            name: 'Garfield',
            age: null,
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
        expect(valid.errors && valid.errors[0].keyword).toBe('parse');
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

      test.each([
        ['something'], // string
        [123], // number
        [{ hello: 'world' }], // object
        [['1', '2']], // array
        [null], // null
      ])('allows %s, when schema is an empty object', (unknownValue: unknown) => {
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'put',
          headers,
          body: {
            name: 'Garfield',
            unknownValue,
          },
        });
        expect(valid.errors).toBeFalsy();
      });
    });
  });

  describe('.validateResponse', () => {
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

    const validator = new OpenAPIValidator({
      definition: {
        ...meta,
        paths: {
          '/pets': {
            get: {
              operationId: 'listPets',
              responses: {
                200: {
                  description: 'list of pets',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: petSchema,
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: 'createPet',
              responses: {
                201: {
                  description: 'created pet',
                },
              },
            },
          },
          '/pets/{id}': {
            get: {
              operationId: 'getPetById',
              responses: {
                200: {
                  description: 'a pet',
                  content: {
                    'application/json': {
                      schema: petSchema,
                    },
                  },
                },
                404: {
                  description: 'pet not found',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          err: { type: 'string' },
                        },
                        required: ['err'],
                      },
                    },
                  },
                },
              },
            },
            delete: {
              operationId: 'deletePetById',
              responses: {
                204: {
                  description: 'a pet',
                },
                default: {
                  description: 'pet not found',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          err: { type: 'string' },
                        },
                        required: ['err'],
                      },
                    },
                  },
                },
              },
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
      ...constructorOpts,
    });

    test('passes validation with valid 200 response object and operationId getPetById', async () => {
      const valid = validator.validateResponse(
        {
          name: 'Garfield',
          age: 30,
        },
        'getPetById',
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid 200 response object and operation object for getPetById', async () => {
      const valid = validator.validateResponse(
        {
          name: 'Garfield',
          age: 30,
        },
        {
          method: 'get',
          path: '/pets/{id}',
          operationId: 'getPetById',
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid 404 response object and operationId getPetById', async () => {
      const valid = validator.validateResponse(
        {
          err: 'pet not found',
        },
        'getPetById',
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid response array and operationId listPets', async () => {
      const valid = validator.validateResponse(
        [
          {
            name: 'Garfield',
            age: 30,
          },
          {
            name: 'Odie',
            age: 2,
          },
        ],
        'listPets',
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with an invalid response object', async () => {
      const valid = validator.validateResponse(
        {
          unknown: 'property',
        },
        'getPetById',
      );
      expect(valid.errors).toBeTruthy();
    });

    test('fails validation with a missing response object', async () => {
      const valid = validator.validateResponse(null, 'getPetById');
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation for an operation with no response schemas', async () => {
      const valid = validator.validateResponse({}, 'createPet');
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid 200 response object and operationId getPetById', async () => {
      const valid = validator.validateResponse(
        {
          name: 'Garfield',
          age: 30,
        },
        'getPetById',
        200,
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with valid 404 response object and operationId getPetById', async () => {
      const valid = validator.validateResponse(
        {
          name: 'Garfield',
          age: 30,
        },
        'getPetById',
        404,
      );
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation with valid 200 response object and operation object for getPetById', async () => {
      const valid = validator.validateResponse(
        {
          name: 'Garfield',
          age: 30,
        },
        {
          method: 'get',
          path: '/pets/{id}',
          operationId: 'getPetById',
        },
        200,
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with valid 404 response object and operation object for getPetById', async () => {
      const valid = validator.validateResponse(
        {
          name: 'Garfield',
          age: 30,
        },
        {
          method: 'get',
          path: '/pets/{id}',
          operationId: 'getPetById',
        },
        404,
      );
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation with valid 404 response object and operationId getPetById', async () => {
      const valid = validator.validateResponse(
        {
          err: 'pet not found',
        },
        'getPetById',
        404,
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with valid 200 response object and operationId getPetById', async () => {
      const valid = validator.validateResponse(
        {
          err: 'pet not found',
        },
        'getPetById',
        200,
      );
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation with valid 204 containing no body when there is a default response', async () => {
      const valid = validator.validateResponse(
        null,
        {
          method: 'delete',
          path: '/pets/{id}',
          operationId: 'deletePetById',
        },
        204,
      );
      expect(valid.errors).toBeFalsy();
    });
  });

  describe('.validateResponseHeaders', () => {
    const validator = new OpenAPIValidator({
      definition: {
        ...meta,
        paths: {
          '/pets': {
            get: {
              operationId: 'listPets',
              responses: {
                200: {
                  description: 'list of pets',
                  headers: {
                    'X-Integer': {
                      description: 'A header with an Integer',
                      schema: {
                        type: 'integer',
                      },
                    },
                    'X-String': {
                      description: 'The number of remaining requests in the current period',
                      schema: {
                        type: 'string',
                      },
                    },
                    'X-Boolean': {
                      description: 'The number of seconds left in the current period',
                      schema: {
                        type: 'boolean',
                      },
                    },
                  },
                },
                '2XX': {
                  description: 'list of pets',
                  headers: {
                    'X-Other-Integer': {
                      description: 'A header with an Integer',
                      schema: {
                        type: 'integer',
                      },
                    },
                    'X-Other-String': {
                      description: 'The number of remaining requests in the current period',
                      schema: {
                        type: 'string',
                      },
                    },
                    'X-Other-Boolean': {
                      description: 'The number of seconds left in the current period',
                      schema: {
                        type: 'boolean',
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: 'createPet',
              responses: {
                201: {
                  description: 'created pet',
                  headers: {
                    'X-Integer': {
                      description: 'A header with an Integer',
                      schema: {
                        type: 'integer',
                      },
                    },
                    'X-String': {
                      description: 'The number of remaining requests in the current period',
                      schema: {
                        type: 'string',
                      },
                    },
                    'X-Boolean': {
                      description: 'The number of seconds left in the current period',
                      schema: {
                        type: 'boolean',
                      },
                    },
                  },
                },
                default: {
                  description: 'created pet',
                  headers: {
                    'X-Other-Integer': {
                      description: 'A header with an Integer',
                      schema: {
                        type: 'integer',
                      },
                    },
                    'X-Other-String': {
                      description: 'The number of remaining requests in the current period',
                      schema: {
                        type: 'string',
                      },
                    },
                    'X-Other-Boolean': {
                      description: 'The number of seconds left in the current period',
                      schema: {
                        type: 'boolean',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ...constructorOpts,
    });

    test('passes validation with valid header object and operationId listPets, no options', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': 42,
          'X-String': '42',
          'X-Boolean': true,
        },
        'listPets',
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid header object and operationId listPets', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': 42,
          'X-String': '42',
          'X-Boolean': true,
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid header object, operationId listPets and no statusCode', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': 42,
          'X-String': '42',
          'X-Boolean': true,
        },
        'listPets',
        {
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid header object and operationId createPet', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': 42,
          'X-String': '42',
          'X-Boolean': true,
        },
        'createPet',
        {
          statusCode: 201,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with valid header object after coercion and operationId listPets', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': '42',
          'X-String': 42,
          'X-Boolean': 'true',
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation when fallback to default', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Other-Integer': '42',
          'X-Other-String': 42,
          'X-Other-Boolean': 'true',
        },
        'createPet',
        {
          statusCode: 404,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('passes validation with additional headers and setMatchType is superset', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': '42',
          'X-String': 42,
          'X-Boolean': 'true',
          'X-Other': 'false',
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Superset,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with missing headers and setMatchType is superset', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': '42',
          'X-String': 42,
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Superset,
        },
      );
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation with missing headers and setMatchType is subset', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': '42',
          'X-String': 42,
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Subset,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with additional headers and setMatchType is subset', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': '42',
          'X-String': 42,
          'X-Boolean': 'true',
          'X-Other': 'false',
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Subset,
        },
      );
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation with any header set and setMatchType is any', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Integer': '42',
          'X-String': 42,
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Any,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with an invalid response object', async () => {
      const valid = validator.validateResponseHeaders(
        {
          unknown: 'property',
        },
        'listPets',
        {
          statusCode: 200,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeTruthy();
    });

    test('fails validation with a missing response object', async () => {
      const valid = validator.validateResponseHeaders(null, 'listPets', {
        statusCode: 200,
        setMatchType: SetMatchType.Exact,
      });
      expect(valid.errors).toBeTruthy();
    });

    test('passes validation with a res code handler fallback', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-Other-Integer': '42',
          'X-Other-String': 42,
          'X-Other-Boolean': 'true',
        },
        'listPets',
        {
          statusCode: 205,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('throw an error when passing SetMatchType', async () => {
      expect(() => {
        validator.validateResponseHeaders(
          {
            'X-Other-Integer': '42',
            'X-Other-String': 42,
            'X-Other-Boolean': 'true',
          },
          'listPets',
          {
            statusCode: 205,
            setMatchType: 'error' as SetMatchType,
          },
        );
      }).toThrow();
    });

    test('passes validation with header case not matching the spec', async () => {
      const valid = validator.validateResponseHeaders(
        {
          'X-OtHer-InTeger': '42',
          'x-other-string': 42,
          'X-OTHER-BOOLEAN': 'true',
        },
        'listPets',
        {
          statusCode: 205,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeFalsy();
    });

    test('fails validation with header separators omitted', async () => {
      const valid = validator.validateResponseHeaders(
        {
          xotherinteger: '42',
          xotherstring: 42,
          XOTHERBOOLEAN: 'true',
        },
        'listPets',
        {
          statusCode: 205,
          setMatchType: SetMatchType.Exact,
        },
      );
      expect(valid.errors).toBeTruthy();
    });
  });

  describe('OAS formats', () => {
    describe('in request', () => {
      const paths: OpenAPIV3_1.PathsObject = {
        '/pets': {
          post: {
            operationId: 'createPet',
            responses: { 201: { description: 'ok' } },
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      int32: {
                        type: 'integer',
                        format: 'int32', // openapi specific format
                      },
                      int64: {
                        type: 'integer',
                        format: 'int64', // openapi specific format
                      },
                      float: {
                        type: 'number',
                        format: 'float', // openapi specific format
                      },
                      double: {
                        type: 'number',
                        format: 'double', // openapi specific format
                      },
                      byte: {
                        type: 'string',
                        format: 'byte', // openapi specific format
                      },
                      binary: {
                        type: 'string',
                        format: 'binary', // openapi specific format
                      },
                      password: {
                        type: 'string',
                        format: 'password', // openapi specific format
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      test('default Ajv should not warn about OAS formats in requestBody', () => {
        const warn = console.warn;
        console.warn = jest.fn();
        const construct = () =>
          new OpenAPIValidator({
            definition: {
              ...meta,
              paths,
            },
            ...constructorOpts,
          });
        expect(construct()).toBeInstanceOf(OpenAPIValidator);
        expect(console.warn).not.toBeCalled();
        console.warn = warn; // reset console.warn
      });

      test('passes validation for POST /pets with full object using valid OAS formats', async () => {
        const validator = new OpenAPIValidator({
          definition: {
            ...meta,
            paths,
          },
          ...constructorOpts,
        });
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            int32: 32,
            int64: 64,
            float: 2.0,
            double: 2.0,
            byte: 'VGVzdA==',
            binary: 'BLOB',
            password: 'shhh',
          },
        });
        expect(valid.errors).toBeFalsy();
      });

      test('fails validation for POST /pets with invalid int32 property', async () => {
        const validator = new OpenAPIValidator({
          definition: {
            ...meta,
            paths,
          },
          ...constructorOpts,
        });
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            int32: Math.pow(2, 31),
          },
        });
        expect(valid.errors).toBeTruthy();
      });

      test('fails validation for POST /pets with invalid int64 property', async () => {
        const validator = new OpenAPIValidator({
          definition: {
            ...meta,
            paths,
          },
          ...constructorOpts,
        });
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            int64: Math.pow(2, 63),
          },
        });
        expect(valid.errors).toBeTruthy();
      });

      test('fails validation for POST /pets with invalid byte property', async () => {
        const validator = new OpenAPIValidator({
          definition: {
            ...meta,
            paths,
          },
          ...constructorOpts,
        });
        const valid = validator.validateRequest({
          path: '/pets',
          method: 'post',
          headers,
          body: {
            byte: 'NOT BASE64',
          },
        });
        expect(valid.errors).toBeTruthy();
      });
    });
  });
});

describe('OpenAPIValidator', () => {
  describe('customizeAjv', () => {
    describe('using custom formats', () => {
      const paths: OpenAPIV3_1.PathsObject = {
        '/pets/{id}': {
          get: {
            operationId: 'getPet',
            responses: { 200: { description: 'ok' } },
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: {
                  type: 'integer',
                  format: 'custom',
                },
              },
            ],
          },
        },
        '/pets': {
          get: {
            operationId: 'getPets',
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        custom: {
                          type: 'integer',
                          format: 'custom',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: 'createPet',
            responses: { 201: { description: 'ok' } },
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      custom: {
                        type: 'integer',
                        format: 'custom',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      test('customised Ajv should throw error for unknown formats in response', () => {
        const getPets = paths?.['/pets']?.get;
        const warn = console.warn;
        console.warn = jest.fn();
        const construct = () =>
          new OpenAPIValidator({
            definition: {
              ...meta,
              paths: {
                '/pets': { get: getPets },
              },
            },
            customizeAjv: () => new Ajv({ strict: true }),
          });
        expect(construct).toThrow();
        console.warn = warn; // reset console.warn
      });

      test('customised Ajv should ignore unknown formats in params', () => {
        const getPet = paths?.['/pets']?.get;
        const warn = console.warn;
        console.warn = jest.fn();
        const construct = () =>
          new OpenAPIValidator({
            definition: {
              ...meta,
              paths: {
                '/pets/{id}': { get: getPet },
              },
            },
            customizeAjv: (_ajv, ajvOpts) => new Ajv({ ...ajvOpts, formats: { custom: true } }),
          });
        expect(construct()).toBeInstanceOf(OpenAPIValidator);
        expect(console.warn).toBeCalledTimes(0);
        console.warn = warn; // reset console.warn
      });

      test('customised Ajv should warn about unknown formats in requestBody', () => {
        const createPet = paths?.['/pets']?.post;
        const warn = console.warn;
        console.warn = jest.fn();
        const construct = () =>
          new OpenAPIValidator({
            definition: {
              ...meta,
              paths: {
                '/pets': { post: createPet },
              },
            },
            customizeAjv: (_ajv, ajvOpts) => new Ajv({ ...ajvOpts }),
          });
        expect(construct()).toBeInstanceOf(OpenAPIValidator);
        expect(console.warn).toBeCalled();
        console.warn = warn; // reset console.warn
      });

      test('non-customised Ajv should warn about unknown formats', () => {
        const warn = console.warn;
        console.warn = jest.fn();
        const construct = () =>
          new OpenAPIValidator({
            definition: {
              ...meta,
              paths,
            },
          });
        expect(construct()).toBeInstanceOf(OpenAPIValidator);
        expect(console.warn).toBeCalled();
        console.warn = warn; // reset console.warn
      });
    });
  });
});
