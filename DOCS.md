# OpenAPI Backend Documentation

<!-- toc -->

- [Getting Started](#getting-started)
- [Installation](#installation)
- [Class OpenAPIBackend](#class-openapibackend)
  - [new OpenAPIBackend(opts)](#new-openapibackendopts)
    - [Parameter: opts](#parameter-opts)
    - [Parameter: opts.definition](#parameter-optsdefinition)
    - [Parameter: opts.strict](#parameter-optsstrict)
    - [Parameter: opts.validate](#parameter-optsvalidate)
    - [Parameter: opts.handlers](#parameter-optshandlers)
  - [.init()](#init)
  - [.handleRequest(req, ...handlerArgs)](#handlerequestreq-handlerargs)
    - [Parameter: req](#parameter-req)
    - [Parameter: handlerArgs](#parameter-handlerargs)
  - [.validateRequest(req)](#validaterequestreq)
    - [Parameter: req](#parameter-req)
  - [.register(handlers)](#registerhandlers)
    - [Parameter: opts.handlers](#parameter-optshandlers)
  - [.registerHandler(operationId, handler)](#registerhandleroperationid-handler)
    - [Parameter: operationId](#parameter-operationid)
    - [Parameter: handler](#parameter-handler)
  - [.validateDefinition()](#validatedefinition)
- [Interfaces](#interfaces)
  - [Document Object](#document-object)
  - [Request Object](#request-object)
- [Operation Handlers](#operation-handlers)
  - [validationFail Handler](#validationfail-handler)
  - [notFound Handler](#notfound-handler)
  - [notImplemented Handler](#notimplemented-handler)

<!-- tocstop -->

## Getting Started

The easiest way to get started with OpenAPI Backend is to check out one of the
[example projects](https://github.com/anttiviljami/openapi-backend/tree/master/examples).

## Installation

OpenAPI Backend is a JavaScript module written in TypeScript. You can install it directly from the NPM repository and
import it to your Node.js or TypeScript project.

```
npm install --save openapi-backend
```

ES6 import syntax:
```javascript
import OpenAPIBackend from 'openapi-backend';
```

CommonJS require syntax:
```javascript
const OpenAPIBackend = require('openapi-backend').default;
```

The main `OpenAPIBackend` class is exported as the default export for the `'openapi-backend'` module.

## Class OpenAPIBackend

OpenAPIBackend is the main class you can interact with. You can create a new instance and initalize it with your
OpenAPI document and handlers.

### new OpenAPIBackend(opts)

Creates an instance of OpenAPIBackend and returns it.

Example:
```javascript
const api = new OpenAPIBackend({
  definition: './openapi.yml',
  strict: true,
  validate: true,
  handlers: {
    getPets: (req, res) => res.json({ result: ['pet1', 'pet2'] }),
    notFound: (req, res) => res.status(404).json({ err: 'not found' }),
    validationFail: (err, req, res) => res.status(404).json({ err }),
  },
});
```

#### Parameter: opts

Constructor options

#### Parameter: opts.definition

The OpenAPI definition as a file path or [Document object](#document-object).

Type: `Document | string`

#### Parameter: opts.strict

Optional. Strict mode, throw errors or warn on OpenAPI spec validation errors (default: false)

Type: `boolean`

#### Parameter: opts.validate

Optional. Enable or disable request validation (default: true)

Type: `boolean`

#### Parameter: opts.handlers

Optional. [Operation Handlers](#operation-handlers) to be registered.

Type: `{ [operationId: string]: Handler | ErrorHandler }`

### .init()

Initalizes the OpenAPIBackend instace for use.

1. Loads and parses the OpenAPI document passed in constructor options
1. Validates the OpenAPI document
1. Builds validation schemas for all API operations
1. Marks member property `initalized` to true
1. Registers all [Operation Handlers](#operation-handlers) passed in constructor options

The `init()` method should be caAled right after creating a new instance of OpenAPIBackend. Although for ease of use,
some methods like `handleRequest()` will call the method if the initalized member property is set to false.

Returns the initalized OpenAPI backend instance.

Example:
```javascript
api.init();
```

### .handleRequest(req, ...handlerArgs)

Handles a request

1. Routing: Matches the request to an API operation
1. Validation: Validates the request against the API operation schema (skipped when .validate is set to false)
1. Handling: Passes the request on to a registered operation handler

Example usage:
```javascript
const response = await api.handleRequest(
  {
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    headers: req.headers,
  },
  req,
  res,
));
```

#### Parameter: req

A request to handle.

Type: [`Request`](#request-object)

#### Parameter: handlerArgs

The handler arguments to be passed to the [Operation Handler](#operation-handlers).

These should be the arguments you normally use when handling requests in your backend, such as the Express request and
response or the Lambda event and context.

Type: `any[]`

### .validateRequest(req)

Validates a request and returns the result.

The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to validate
it.

Normally, you wouldn't need to explicitly call `.validateRequest()` because `.handleRequest()` calls it for you when
validation is set to `true`. But if you like, you can use it to just do request validation separately from handling.

Returns a validated [Ajv instance](https://ajv.js.org). Hint: Generally you want to check its errors property.

Example usage:
```javascript
// express example
const validation = await api.validateRequest(
  {
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    headers: req.headers,
  },
);
if (validation.errors) {
  // handle Ajv the error here
}
```

#### Parameter: req

A request to validate.

Type: [`Request`](#request-object)

### .matchOperation(req)

Matches a request to an API operation (router) and returns the matched [Operation Object](#operation-object).

Example usage:
```javascript
const operation = api.matchOperation({
  method: 'GET',
  path: '/pets',
  headers: { accept: 'application/json' },
});
```

#### Parameter: req

A request to match to an Operation.

Type: [`Request`](#request-object)

### .register(handlers)

Registers multiple [Operation Handlers](#operation-handlers).

Example usage:
```javascript
api.register({
  getPets: (req, res) => res.json({ result: ['pet1', 'pet2'] }),
  notFound: (req, res) => res.status(404).json({ err: 'not found' }),
  validationFail: (err, req, res) => res.status(404).json({ err }),
});
```

#### Parameter: opts.handlers

[Operation Handlers](#operation-handlers) to be registered.

Type: `{ [operationId: string]: Handler | ErrorHandler }`

### .registerHandler(operationId, handler)

Registers a handler for an operation.

Example usage:
```javascript
api.registerHandler('getPets', function (req, res) {
  return {
    status: 200,
    body: JSON.stringify(['pet1', 'pet2']),
  };
};
```

#### Parameter: operationId

The operationId of the operation to register a handler for.

Type: `string`

#### Parameter: handler

The operation handler.

Type: `Handler | ErrorHandler`

### .validateDefinition()

Validates and returns the parsed document. Throws an error if validation fails.

*NOTE: This method can't be called before `init()` is complete.*

## Operation Handlers

You can register *Operation Handlers* for operationIds specified by your OpenAPI document.

These get called with the `.handleRequest()` method after routing and (optionally) validation is finished.

Example handler for Express
```javascript
async function getPetByIdHandler(req, res) {
  const { id } = req.query;
  const pets = await pets.getPetById(id);
  return res.status(200).json({ result: pets });
}
api.register('getPetById', getPetByIdHandler);
```

There are different ways to register operation handlers:

1. In the [`new OpenAPIBackend`](#new-openapibackendopts) constructor options
1. With the [`.register()`](#registerhandlers) method
1. With the [`.registerHandler()`](registerhandleroperationid-handler) method

In addition to the operationId handlers, you should also specify special handlers for different situtations:

### validationFail Handler

The `validationFail` handler gets called by `.handleRequest()` if the input validation fails for a request.

HINT: You should probably return a 400 status code from this handler.

Example handler:
```javascript
function validationFailHandler(err, req, res) {
  return res.status(400).json({ status: 400, err });
}
api.register('notImplemented', validationFailHandler);
```

### notFound Handler

The `notFound` handler gets called by `.handleRequest()` if the routing doesn't match an operation in the API
definitions.

HINT: You should probably return a 404 status code from this handler.

Example handler:
```javascript
function notFoundHandler(req, res) {
  return res.status(404).json({ status: 404, err: 'Not found' });
}
api.register('notFound', notFoundHandler);
```

### notImplemented Handler

The `notImplemented` handler gets called by `.handleRequest()` if no other Operation Handler has been registered for
the matched operation.

HINT: You can either mock the response or return a 501 status code.

Example handler:
```javascript
function notImplementedHandler(req, res) {
  return res.status(404).json({ status: 501, err: 'No handler registered for operation' });
}
api.register('notImplemented', notImplementedHandler);
```

## Interfaces

The `openapi-backend` module exports type definitions for TypeScript users. You can import them like you would normally.

### Document Object

The `Document` interface is a JavaScript object representation of an OpenAPI specification document.

OpenAPIBackend uses type definitions from [`openapi-types`](https://www.npmjs.com/package/openapi-types), but
re-exports the Document interface for ease of use.

NOTE: Only OpenAPI v3+ documents are currently supported.

```typescript
import { Document } from 'openapi-backend';
```

An example Document Object:
```javascript
const definition = {
  openapi: '3.0.1',
  info: {
    title: 'My API',
    version: '1.0.0',
  },
  paths: {
    '/pets': {
      get: {
        operationId: 'getPets',
        responses: {
          200: { description: 'ok' },
        },
      },
    },
    '/pets/{id}': {
      get: {
        operationId: 'getPetById',
        responses: {
          200: { description: 'ok' },
        },
      },
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: {
            type: 'integer',
          },
        },
      ],
    },
  },
}
```

### Request Object

The `Request` interface represents a generic HTTP request.

```javascript
import { Request } from 'openapi-backend';
```

Example object
```javascript
const request = {
  // HTTP method of the request
  method: 'POST',
  // path of the request
  path: '/pets/1/treat',
  // HTTP request headers
  headers: { 'accept': 'application/json', 'cookie': 'sessionid=abc123;' },
  // parsed query parameters (optional), we also parse query params from the path property
  query: { 'format': 'json' },
  // the request body (optional), either raw buffer/string or a parsed object/array
  body: { treat: 'bone' },
};
```

### ParsedRequest Object

The `ParsedRequest` interface represents a generic parsed HTTP request.

```javascript
import { ParsedRequest } from 'openapi-backend';
```

Example object
```javascript
const parsedRequest = {
  // HTTP method of the request (in lowercase)
  method: 'post',
  // path of the request
  path: '/pets/1/treat',
  // the path params for the request
  params: { id: 1 },
  // HTTP request headers
  headers: { 'accept': 'application/json', 'cookie': 'sessionid=abc123;' },
  // the parsed cookies
  cookies: { sessionid: 'abc123' },
  // parsed query parameters (optional), we also parse query params from the path property
  query: { 'format': 'json' },
  // the request body (optional), either raw buffer/string or a parsed object/array
  body: '{ "treat": "bone" }',
  // the parsed request body
  requestBody: { treat: 'bone' },
};
```

### Operation Object

The `Operation` interface is an [OpenAPI Operation Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#operationObject)
extended with the path and method of the operation for easier use. It should also include the path base object's
parameters in its `parameters` property. 

All JSON schemas in an Operation Object should be dereferenced i.e. not contain any `$ref` properties.

```javascript
import { Operation } from 'openapi-backend';
```

Example object
```javascript
const operation = {
  method: 'patch',
  path: '/pets/{id}',
  operationId: 'updatePetById',
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
  requestBody: {
    content: {
      'application/json': {
        schema: {
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
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Pet updated succesfully',
    },
  },
};
```
