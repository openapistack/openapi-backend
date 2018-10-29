# OpenAPI Backend Documentation

<!-- toc -->

- [Installation](#installation)
- [Class OpenAPIBackend](#class-openapibackend)
  - [new OpenAPIBackend(opts): OpenAPIBackend](#new-openapibackendopts-openapibackend)
    - [Parameter: opts](#parameter-opts)
    - [Parameter: opts.definition](#parameter-optsdefinition)
    - [Parameter: opts.strict](#parameter-optsstrict)
    - [Parameter: opts.validate](#parameter-optsvalidate)
    - [Parameter: opts.handlers](#parameter-optshandlers)
  - [.init(): Promise&lt;OpenAPIBackend&gt;](#init-promiseltopenapibackendgt)
  - [.handleRequest(req, ...handlerArgs): Promise&lt;any&gt;](#handlerequestreq-handlerargs-promiseltanygt)
    - [Parameter: req](#parameter-req)
    - [Parameter: handlerArgs](#parameter-handlerargs)
  - [.validateRequest(req): Ajv.ValidateFunction](#validaterequestreq-ajvvalidatefunction)
    - [Parameter: req](#parameter-req)
  - [.register(handlers): void](#registerhandlers-void)
    - [Parameter: opts.handlers](#parameter-optshandlers)
  - [.registerHandler(operationId, handler): void](#registerhandleroperationid-handler-void)
    - [Parameter: operationId](#parameter-operationid)
    - [Parameter: handler](#parameter-handler)
  - [.validateDefinition(): Document](#validatedefinition-document)
- [Interfaces](#interfaces)
  - [Document Object](#document-object)
  - [Request Object](#request-object)
- [Operation Handlers](#operation-handlers)
  - [validationFail Handler](#validationfail-handler)
  - [notFound Handler](#notfound-handler)
  - [notImplemented Handler](#notimplemented-handler)

<!-- tocstop -->

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

The OpenAPIBackend is the main class you can interact with. You can create a new instance and initalize it with your
OpenAPI document and handlers.

### new OpenAPIBackend(opts): OpenAPIBackend

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

### .init(): Promise&lt;OpenAPIBackend&gt;

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

### .handleRequest(req, ...handlerArgs): Promise&lt;any&gt;

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

Type: [`RequestObject`](#request-object)

#### Parameter: handlerArgs

The handler arguments to be passed to the [Operation Handler](#operation-handlers).

These should be the arguments you normally use when handling requests in your backend, such as the Express request and
response or the Lambda event and context.

Type: `any[]`

### .validateRequest(req): Ajv.ValidateFunction

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

Type: [`RequestObject`](#request-object)

### .register(handlers): void

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

### .registerHandler(operationId, handler): void

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

### .validateDefinition(): Document

Validates and returns the parsed document. Throws an error if validation fails.

*NOTE: This method can't be called before `init()` is complete.*

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

The `RequestObject` interface represents a generic HTTP request.

```javascript
import { RequestObject } from 'openapi-backend';
```

Example object
```javascript
const request = {
  // HTTP method of the request
  method: 'POST',
  // path of the request
  path: '/pets/actions/treat',
  // HTTP request headers
  headers: { 'accept': 'application/json', 'cookie': 'sessionid=abc123;' },
  // parsed query parameters (optional), we also parse query params from the path property
  query: { 'format': 'json' },
  // the request body (optional), either raw buffer/string or a parsed object/array
  body: { treat: 'bone' },
};
```

## Operation Handlers

You can register *Operation Handlers* for operationIds specified by your OpenAPI document.

These get called with the `.handleRequest()` method after routing and (optionally) validation is finished.

Example handler for Express
```javascript
async function getPetHandler(req, res) {
  const { id } = req.query;
  const pets = await getPetById(id);
  return res.status(200).json({ result: pets });
}
```

There are different ways to register operation handlers:

1. In the `new OpenAPIBackend` constructor options
1. With the `.register()` method
1. With the `.registerHandler()` method

In addition to the operationId handlers, you should also specify special handlers for different situtations:

### validationFail Handler

The `validationFail` handler gets called by `.handleRequest()` if the input validation fails for a request.

HINT: You should probably return a 400 status code from this handler.

Example handler:
```
@TODO
```

### notFound Handler

The `notFound` handler gets called by `.handleRequest()` if the routing doesn't match an operation in the API
definitions.

HINT: You should probably return a 404 status code from this handler.

Example handler:
```
@TODO
```

### notImplemented Handler

The `notImplemented` handler gets called by `.handleRequest()` if no other Operation Handler has been registered for
the matched operation.

HINT: You can either mock the response or return a 501 status code.

Example handler:
```
@TODO
```
