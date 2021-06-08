# OpenAPI Backend Documentation

<!-- toc -->

- [Getting Started](#getting-started)
- [Installation](#installation)
- [Class OpenAPIBackend](#class-openapibackend)
  - [new OpenAPIBackend(opts)](#new-openapibackendopts)
  - [.init()](#init)
  - [.handleRequest(req, ...handlerArgs)](#handlerequestreq-handlerargs)
  - [.validateRequest()](#validaterequest)
  - [.validateResponse()](#validateresponse)
  - [.validateResponseHeaders()](#validateresponseheaders)
  - [.matchOperation()](#matchoperation)
  - [.register(operationId, handler)](#registeroperationid-handler)
  - [.register(handlers)](#registerhandlers)
  - [.mockResponseForOperation(operationId, opts?)](#mockresponseforoperationoperationid-opts)
  - [.registerSecurityHandler(name, handler)](#registersecurityhandlername-handler)
  - [.router](#router)
  - [.validator](#validator)
- [Class OpenAPIRouter](#class-openapirouter)
  - [new OpenAPIRouter(opts)](#new-openapirouteropts)
  - [.matchOperation(req)](#matchoperationreq)
  - [.getOperations()](#getoperations)
  - [.getOperation(operationId)](#getoperationoperationid)
  - [.parseRequest(req, operation?)](#parserequestreq-operation)
- [Class OpenAPIValidator](#class-openapivalidator)
  - [new OpenAPIValidator(opts)](#new-openapivalidatoropts)
  - [.validateRequest(req, operation?)](#validaterequestreq-operation)
  - [.validateResponse(res, operation, statusCode?)](#validateresponseres-operation-statuscode)
  - [.validateResponseHeaders(headers, operation, opts?)](#validateresponseheadersheaders-operation-opts)
- [Operation Handlers](#operation-handlers)
  - [validationFail Handler](#validationfail-handler)
  - [notFound Handler](#notfound-handler)
  - [methodNotAllowed Handler](#methodnotallowed-handler)
  - [notImplemented Handler](#notimplemented-handler)
  - [unauthorizedHandler Handler](#unauthorizedhandler-handler)
  - [postResponseHandler Handler](#postresponsehandler-handler)
- [Security Handlers](#security-handlers)
- [Interfaces](#interfaces)
  - [Document Object](#document-object)
  - [Operation Object](#operation-object)
  - [Context Object](#context-object)
  - [Request Object](#request-object)
  - [ParsedRequest Object](#parsedrequest-object)
  - [ValidationResult Object](#validationresult-object)
- [API Versioning](#api-versioning)

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

OpenAPIBackend is the main class you can interact with. You can create a new
instance and initalize it with your OpenAPI document and handlers.

OpenAPIBackend is also the default import of the `openapi-backend` module. It
can be imported  in any of the following ways:

```javascript
import OpenAPIBackend from 'openapi-backend';
```

```javascript
import { OpenAPIBackend } from 'openapi-backend';
```

```javascript
const { OpenAPIBackend } = require('openapi-backend');
```

```javascript
const OpenAPIBackend = require('openapi-backend').default;
```

### new OpenAPIBackend(opts)

Creates an instance of OpenAPIBackend and returns it.

Example:
```javascript
const api = new OpenAPIBackend({
  definition: './openapi.yml',
  strict: true,
  quick: false,
  validate: true,
  ignoreTrailingSlashes: true,
  ajvOpts: { unknownFormats: true },
  customizeAjv: () => new Ajv(),
});
```

#### Parameter: opts

Constructor options

#### Parameter: opts.definition

The OpenAPI definition as a file path or [Document object](#document-object).

Type: `Document | string`

#### Parameter: opts.apiRoot

The root URI of your api. All paths will be matched relative to apiRoot (default: "/")

Type: `string`

#### Parameter: opts.strict

Optional. Strict mode, throw errors or warn on OpenAPI spec validation errors (default: false)

Type: `boolean`

#### Parameter: opts.quick

Optional. Quick startup. Attempts to optimize startup time by skipping and deferring some parts.

This setting is recommended to optimize cold starts in Serverless Function environments such as AWS Lambda / Azure Functions / GCP Cloud Functions.

Type: `boolean`

#### Parameter: opts.validate

Optional. Enable or disable request validation (default: true)

Type: `boolean`

#### Parameter: opts.ignoreTrailingSlashes

Optional. Whether to ignore trailing slashes when routing (default: true)

Type: `boolean`

#### Parameter: opts.ajvOpts

Optional. The default AJV options to use for validation. See [available options](https://ajv.js.org/#options)

Type: `AjvOpts`

#### Parameter: opts.customizeAjv(originalAjv, ajvOpts, validationContext)

Optional. Customizer function to use custom Ajv for validation.

Type: `AjvCustomizer`

Takes in three arguments

- **originalAjv** the original Ajv instance created by OpenAPIBackend
- **ajvOpts** the opts for the original Ajv instance
- **validationContext** the context in which this Ajv instance will be used. One of:
  - `'requestBodyValidator'`
  - `'paramsValidator'`
  - `'responseValidator'`
  - `'responseHeadersValidator'`

Returns an Ajv instance.

#### Parameter: opts.handlers

Optional. [Operation Handlers](#operation-handlers) to be registered.

Type: `{ [operationId: string]: Handler }`

### .init()

Initalizes the OpenAPIBackend instace for use.

1. Loads and parses the OpenAPI document passed in constructor options
1. Validates the OpenAPI document
1. Builds validation schemas for all API operations
1. Marks member property `initalized` to true
1. Registers all [Operation Handlers](#operation-handlers) passed in constructor options

The `init()` method should be called right after creating a new instance of OpenAPIBackend. Although for ease of use,
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

### .validateRequest()

Validates a request and returns the result.

See [`OpenAPIValidator.validateRequest()`](#validaterequestreq-operation)

### .validateResponse()

Validates a response and returns the result.

See [`OpenAPIValidator.validateResponse()`](#validateresponseres-operation-statuscode)

### .validateResponseHeaders()

Validates response headers and returns the result.

See [`OpenAPIValidator.validateResponseHeaders()`](#validateresponseheadersheaders-operation-opts)

### .matchOperation()

Matches a request to an API operation (router).

See [`OpenAPIRouter.matchOperation()`](#matchoperationreq)

### .register(operationId, handler)

Registers a handler for an operation.

Example usage:
```javascript
api.register('getPets', function (c, req, res) {
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

### .mockResponseForOperation(operationId, opts?)

Mocks a response for an operation based on example or response schema.

Returns an object with a status code and the mocked response.

Example usage:
```javascript
api.registerHandler('notImplemented', async (c, req: Request, res: Response) => {
  const { status, mock } = api.mockResponseForOperation(c.operation.operationId);
  return res.status(status).json(mock);
});
```

#### Parameter: operationId

The operationId of the operation for which to mock the response

Type: `string`

#### Parameter: opts

Optional. Options for mocking.

#### Parameter: opts.responseStatus

Optional. The response code of the response to mock (default: 200)

Type: `number`

#### Parameter: opts.mediaType

Optional. The media type of the response to mock (default: application/json)

Type: `string`

#### Parameter: opts.example

Optional. The specific example to use (if operation has multiple examples)

Type: `string`

### .registerSecurityHandler(name, handler)

Registers a security handler for a security scheme.

Example usage:
```javascript
api.registerSecurityHandler('ApiKey', (c) => {
  const authorized = c.request.headers['x-api-key'] === 'SuperSecretPassword123';
  return authorized; 
});
```

See [Security Handlers](#security-handlers)


#### Parameter: name

The name of the [Security Scheme](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securitySchemeObject)
to register a handler for.

Type: `string`

#### Parameter: handler

The security handler.

Type: `Handler | ErrorHandler`

### .router

OpenAPIBackend instances expose an instance of [OpenAPIRouter](#class-openapirouter)
created during [`init()`](#init) to be used for matching requests to their
OpenAPI operations.

### .validator

OpenAPIBackend instances expose an instance of [OpenAPIValidator](#class-openapivalidator)
created during [`init()`](#init) to be used for validating schemas.

## Class OpenAPIRouter

OpenAPIRouter is an internal class that matches an abstract Request object to
an OpenAPI operation.

Calling the [init method](#init) creates an instance of OpenAPIRouter which can
be publicly accessed via the OpenAPIBackend.router property.

The OpenAPIRouter class is exported from the `openapi-backend` module:

```javascript
import { OpenAPIRouter } from 'openapi-backend';
```

```javascript
const { OpenAPIRouter } = require('openapi-backend');
```

You can also directly import the class from the submodule:

```javascript
import { OpenAPIRouter } from 'openapi-backend/router';
```

### new OpenAPIRouter(opts)

Creates an instance of OpenAPIRouter and returns it.

Example:
```javascript
const router = new OpenAPIRouter({
  definition: api.document,
  apiRoot: '/',
  ignoreTrailingSlashes: true,
});
```

#### Parameter: opts

Constructor options

#### Parameter: opts.definition

The OpenAPI definition as a [Document object](#document-object).

Type: `Document`

#### Parameter: opts.apiRoot

Optional. The root URI of your api. All paths will be matched relative to apiRoot (default: "/")

Type: `string`

#### Parameter: opts.ignoreTrailingSlashes

Optional. Whether to ignore trailing slashes when routing (default: true)

Type: `string`

### .matchOperation(req)

Matches a request to an API operation (router) and returns the matched [Operation Object](#operation-object). Returns
`undefined` if no operation was matched.

Example usage:
```javascript
const operation = api.router.matchOperation({
  method: 'GET',
  path: '/pets',
  headers: { accept: 'application/json' },
});
```

#### Parameter: req

A request to match to an Operation.

Type: [`Request`](#request-object)

### .getOperations()

Flattens operations into a simple array of [Operation objects](#operation-object) easy to work with.

Example usage:
```javascript
const operations = api.router.getOperations();
console.log(`There are ${operations.length} operations in this api`);
```

### .getOperation(operationId)

Gets a single operation by its operationId.

Example usage:
```javascript
const operation = api.router.getOperation('getPets');
console.log(`The tags for getPets are: ${operation.tags.join(', ')}`);
```

#### Parameter: operationId

The operationId of the operation to get.

Type: `string`

### .parseRequest(req, operation?)

Parses and normalizes a request.

This method used to construct the parsed request for [Context objects](#context-object).

1. Parses body into an object
1. Parses query parameters from query string
1. Parses cookies from the cookie header
1. Parses path parameters from the request uri and passed operation path template
1. Strips apiRoot from path

```javascript
const parsedRequest = api.router.parseRequest({
  method: 'GET',
  path: '/v1/pet/8?fields=id,name',
  headers: {
    accept: 'application/json',
    cookie: 'token=abc123;path=/',
  },
}, api.getOperation('getPetById'));

assert(parsedRequest.method, 'get');
assert(parsedRequest.query.fields, ['id', 'name']);
assert(parsedRequest.cookies.token, 'abc123');
assert(parsedRequest.path, '/pet/8');
assert(parsedRequest.params.id, '8');
```

#### Parameter: req

A request to parse.

Type: [`Request`](#request-object)

#### Parameter: operation

Optional. An operation object to match the request with. Used to parse path and query parameters according to operation spec.

Type: `string`

## Class OpenAPIValidator

OpenAPIValidator is an internal class for performing validations against json
schemas in an OpenAPI definition.

Calling the [init method](#init) creates an instance of OpenAPIValidator which can
be publicly accessed via the OpenAPIBackend.validator property.

### new OpenAPIValidator(opts)

Creates an instance of OpenAPIValidator and returns it.

Example:
```javascript
const validator = new OpenAPIValidator({
  definition: api.document,
  router: new OpenAPIRouter()
  ajvOpts: { unknownFormats: true },
  lazyCompileValidators: false,
  customizeAjv: (originalAjv, ajvOpts, validationContext) => new Ajv(),
});
```

The OpenAPIValidator class is exported from the `openapi-backend` module:

```javascript
import { OpenAPIValidator } from 'openapi-backend';
```

```javascript
const { OpenAPIValidator } = require('openapi-backend');
```

You can also directly import the class from the submodule:

```javascript
import { OpenAPIValidator } from 'openapi-backend/validation';
```

#### Parameter: opts

Constructor options

#### Parameter: opts.definition

The OpenAPI definition as a [Document object](#document-object).

Type: `Document`

#### Parameter: opts.ajvOpts

Optional. The default AJV options to use for validation. See [available options](https://ajv.js.org/#options)

Type: `AjvOpts`

#### Parameter: opts.router

Optional. Passed instance of OpenAPIRouter. Will create new instance from definition object if not passed.

Type: [`OpenAPIRouter`](#class-openapirouter)

#### Parameter: opts.lazyCompileValidators

Optional. When set to `true` skips precompiling Ajv validators and compiles only when needed. Useful for optimizing for init time e.g. in Lambda.

This option is applied when the [OpenAPIBackend `quick` parameter](#parameter-optsquick) is set to `true`.

Type: `Boolean`

#### Parameter: opts.customizeAjv(originalAjv, ajvOpts, validationContext)

Optional. Customizer function to use custom Ajv for validation.

Type: `AjvCustomizer`

Takes in three arguments

- **originalAjv** the original Ajv instance created by OpenAPIBackend
- **ajvOpts** the opts for the original Ajv instance
- **validationContext** the context in which this Ajv instance will be used. One of:
  - `'requestBodyValidator'`
  - `'paramsValidator'`
  - `'responseValidator'`
  - `'responseHeadersValidator'`

Returns an Ajv instance.

### .validateRequest(req, operation?)

Validates a request and returns the result.

The method will first match the request to an API operation and use the pre-compiled Ajv validation schema to validate
it.

Normally, you wouldn't need to explicitly call `.validateRequest()` because `.handleRequest()` calls it for you when
validation is set to `true`. But if you like, you can use it to just do request validation separately from handling.

Returns a [ValidationResult object](#validationresult-object).

Example usage:
```javascript
const valid = await api.validateRequest(
  {
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    headers: req.headers,
  },
);
if (valid.errors) {
  // there were errors
}
```

#### Parameter: req

A request to validate.

Type: [`Request`](#request-object)

#### Parameter: operation

Optional. The Operation object or operationId to validate against.

If omitted, [`.matchOperation()`](#matchoperation-req) will be used to match the operation first.

Type: [`Operation`](#operation-object) or `string` (operationId)


### .validateResponse(res, operation, statusCode?)

Validates a response and returns the result.

The method will use the pre-compiled Ajv validation schema to validate the given response.

You can optionally provide a status code for more accurate validation.

Returns a [ValidationResult object](#validationresult-object).

Example usage:
```javascript
const valid = await api.validateResponse({ name: 'Garfield' }, 'getPetById');
if (valid.errors) {
  // there were errors
}
```

```javascript
const valid = await api.validateResponse({ name: 'Unknown' }, 'getPetById', 200);
if (valid.errors) {
  // there were errors
}
```

#### Parameter: res

The response to validate.

Type: `any`

#### Parameter: operation

The Operation object or operationId to validate against.

Type: [`Operation`](#operation-object) or `string`

#### Parameter: statusCode

The HTTP response status code.

Type: `number`

### .validateResponseHeaders(headers, operation, opts?)

Validates response headers and returns the result.

The method will use the pre-compiled Ajv validation schema to validate the given response.

Returns a [ValidationResult object](#validationresult-object).

Example usage:
```javascript
const valid = await api.validateResponseHeaders(
  {
    'Content-Type': 'text/plain',
  },
  'getPetById',
  {
    statusCode: 200,
    setMatchType: 'exact',
  },
);
if (valid.errors) {
  // there were errors
}
```

#### Parameter: headers

The response headers to validate.

Type: `any`

#### Parameter: operation

The Operation object or operationId to validate against.

Type: [`Operation`](#operation-object) or `string`

#### Parameter: opts

Optional. Options for validate the response headers.

#### Parameter: opts.statusCode

Optional. The status code of the response.

Type: `number`

#### Parameter: opts.setMatchType

Optional. The type of set matching to perform, in relation with the set of headers defined in your spec.
It can be `any`, `superset`, `subset` or `exact`. Defaults to `any`.

- `any`: Skip checks for missing or additional headers. It only checks that the types of the headers are matching with the spec.
- `superset`: Check that `headers` is a superset of the headers defined in your spec. In other words, you can have headers in `headers` that are described in your spec.
- `subset`: Check that `headers` is a subset of the headers defined in your spec. In other words, you can have headers in you spec that are not present in `headers`.
- `exact`: Check that `headers` exactly match the headers defined in your spec.

Type: `SetMatchType`

## Operation Handlers

You can register *Operation Handlers* for operationIds specified by your OpenAPI document.

These get called with the `.handleRequest()` method after routing and (optionally) validation is finished.

The first argument of the handler is the [Context object](#context-object) and rest are passed from `.handleRequest()`
arguments, starting from the second one.

Example handler for Express
```javascript
async function getPetByIdHandler(c, req, res) {
  const id = c.request.params.id;
  const pet = await pets.getPetById(id);
  return res.status(200).json({ result: pet });
}
api.register('getPetById', getPetByIdHandler);
```

There are two different ways to register operation handlers:

1. In the [`new OpenAPIBackend`](#new-openapibackendopts) constructor options
1. With the [`.register()`](##registeroperationid-handler) method

In addition to the operationId handlers, you should also specify special handlers for different situtations:


### validationFail Handler

The `validationFail` handler gets called by `.handleRequest()` if the input validation fails for a request.

HINT: You should probably return a 400 status code from this handler.

Example handler:
```javascript
function validationFailHandler(c, req, res) {
  return res.status(400).json({ status: 400, err: c.validation.errors });
}
api.register('validationFail', validationFailHandler);
```

### notFound Handler

The `notFound` handler gets called by `.handleRequest()` if the path doesn't
match an operation in the API definitions.

HINT: You should probably return a 404 status code from this handler.

Example handler:
```javascript
function notFound(c, req, res) {
  return res.status(404).json({ status: 404, err: 'Not found' });
}
api.register('notFound', notFound);
```

### methodNotAllowed Handler

The `methodNotAllowed` handler gets called by `.handleRequest()` if request
method does not match any operations for the path.

If this handler isn't registered, the [notFound Handler](#notfound-handler) will be used instead.

HINT: You should probably return a 405 status code from this handler.

Example handler:
```javascript
function methodNotAllowed(c, req, res) {
  return res.status(405).json({ status: 405, err: 'Method not allowed' });
}
api.register('methodNotAllowed', methodNotAllowed);
```

### notImplemented Handler

The `notImplemented` handler gets called by `.handleRequest()` if no other Operation Handler has been registered for
the matched operation.

HINT: You can either mock the response or return a 501 status code.

Example handler:
```javascript
function notImplementedHandler(c, req, res) {
  return res.status(404).json({ status: 501, err: 'No handler registered for operation' });
}
api.register('notImplemented', notImplementedHandler);
```

### unauthorizedHandler Handler

The `unauthorizedHandler` handler gets called by `.handleRequest()` if security
requirements are not met after checking [Security Requirements](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securityRequirementObject)
and calling their [Security Handlers](#security-handlers).

HINT: You should probably return a 401 or 403 code from this handler and
instruct the client to authenticate.

Example handler:

```javascript
function unauthorizedHandler(c, req, res) {
  return res.status(401).json({ status: 401, err: 'Please authenticate first' });
}
api.register('unauthorizedHandler', unauthorizedHandler);
```

If no `unauthorizedHandler` is registered, the Security Handlers will still be 
called and their output and the authorization status for the request can be
checked in operation handlers via the [`context.security` property](#context-object).

### postResponseHandler Handler

The `postResponseHandler` handler gets called by `.handleRequest()` after resolving the response handler.

The return value of the response handler will be passed in the context object `response` property.

HINT: You can use the postResponseHandler to validate API responses against your response schema

Example handler:
```javascript
function postResponseHandler(c, req, res) {
  const valid = c.api.validateResponse(c.response, c.operation);
  if (valid.errors) {
    // response validation failed
    return res.status(502).json({ status: 502, err: valid.errors });
  }
  return res.status(200).json(c.response);
}
api.register('postResponseHandler', postResponseHandler);
```

## Security Handlers

You can register *Security Handlers* for [Security Schemas](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securitySchemeObject)
specified by your OpenAPI document.

These get called with the `.handleRequest()` method after routing if the
matched operation, or the root OpenAPI document includes the security scheme in
a [Security Requirement Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securityRequirementObject)

Example handler for JWT auth:
```javascript
const jwt = require('jsonwebtoken');

function jwtHandler(c, req, res) {
  const authHeader = c.request.headers['authorization'];
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }
  const token = authHeader.replace('Bearer ', '');
  return jwt.verify(token, 'secret'); 
}

api.registerSecurityHandler('jwt', jwtHandler);
```

The first argument of the handler is the [Context object](#context-object) and rest are passed from `.handleRequest()`
arguments, starting from the second one.

The return value of each security handler is added as a key-value mapping to 
`security` property of the [Context object](#context-object).

Truthy return values from security handlers are generally interpreted as auth 
success, unless the return value is an object containing an `error` property.

All falsy return values are interpreted as auth fail.

Throwing an error from the security handler also gets interpreted as auth fail. The error is available in `context.security[name].error`.

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
const document: Document = {
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

### Operation Object

The `Operation` interface is an [OpenAPI Operation Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#operationObject)
extended with the path and method of the operation for easier use. It should also include the path base object's
parameters in its `parameters` property.

All JSON schemas in an Operation Object should be dereferenced i.e. not contain any `$ref` properties.

```typescript
import { Operation } from 'openapi-backend';
```

Example object
```typescript
const operation: Operation = {
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

### Context Object

The `Context` object gets passed to [Operation Handlers](#operation-handlers) as the first argument.

It contains useful information like the [parsed request](#parsedrequest-object),
the matched [operation](#operation-object), [security handler](#security-handlers)
results and input validation results for the request.

The context object also contains a reference to the OpenAPIBackend instance in `api` property for easy access to
instance methods inside handlers.

```typescript
import { Context } from 'openapi-backend';
```

Example object
```typescript
const context: Context = {
  // reference to OpenAPIBackend instance
  // can be used to access instance OpenAPI instance methods in handlers:
  // - api.validateRequest()
  // - api.validateResponse()
  // - api.mockResponseForOperation()
  api,
  // the parsed request object
  request: {
    method: 'post',
    path: '/pets/1/treat',
    params: { id: '1' },
    headers: { 'accept': 'application/json', 'cookie': 'sessionid=abc123;' },
    cookies: { sessionid: 'abc123' },
    query: { 'format': 'json' },
    body: '{ "treat": "bone" }',
    requestBody: { treat: 'bone' },
  },
  // the matched and dereferenced operation object for request
  operation: {
    method: 'post',
    path: '/pets',
    operationId: 'giveTreatToPetById',
    summary: 'Gives a treat to a pet',
    description: 'Adds a treat to the bowl where a pet can enjoy it.',
    tags: ['pets'],
    parameters: {
      name: 'id',
      in: 'path',
      required: true,
      schema: {
        type: 'integer',
      },
    },
    requestBody: {
      description: 'A treat to give to the pet',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              treat: {
                type: 'string',
              }
            },
            required: ['treat'],
          },
        },
      },
    },
  },
  // Ajv validation results for request
  validation: {
    valid: true,
    errors: null,
  },
  // Security handlers results for request
  security: {
    authorized: true,
    jwt: {
      name: 'John Doe',
      email: 'john@example.com',
      iat: 1516239022,
    },
    basicAuth: false,
  },
  // Return value from operation handler (only passed to postResponseHandler)
  response: {
    message: 'woof! thanks for the treat',
  },
};
```

### Request Object

The `Request` interface represents a generic HTTP request.

```typescript
import { Request } from 'openapi-backend';
```

Example object
```typescript
const request: Request = {
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

```typescript
import { ParsedRequest } from 'openapi-backend';
```

Example object
```typescript
const parsedRequest: ParsedRequest = {
  // HTTP method of the request (in lowercase)
  method: 'post',
  // path of the request
  path: '/pets/1/treat',
  // the path params for the request
  params: { id: '1' },
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

### ValidationResult Object

The `ValidationResult` interface is an object containing the results from performed json schema validation.

The `valid` property is a boolean that tells you whether the validation succeeded (true) or not (false).

The `errors` property is an array of [Ajv ErrorObjects](https://ajv.js.org/#error-objects) from the performed
validation. If no errors were found, this property will be `null`.

```typescript
import { ValidationResult } from 'openapi-backend';
```

Example object
```typescript
const validationResult: ValidationResult = {
  valid: false,
  errors: [
    {
      keyword: 'parse',
      dataPath: '',
      schemaPath: '#/requestBody',
      params: [],
      message: 'Unable to parse JSON request body',
    }
  ],
};
```

## API Versioning

Since OpenAPI specification already supports the `version` field in the [`info` object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#infoObject),
it's easy to do URI versioning utilising multiple [`OpenAPIBackend`](#class-openapibackend) instances with different
[`apiRoot`](#parameter-optsapiroot) values.

Simple example:
```typescript
const apiV1 = new OpenAPIBackend({
  definition: './openapi-v1.json',
  apiRoot: '/v1',
});

const apiV2 = new OpenAPIBackend({
  definition: './openapi-v2.json',
  apiRoot: '/v2',
});

const v1Handlers = {
  notFound,
  getPet,
  listPets,
  createPet,
};
apiV1.register(v1Handlers);

const v2Handlers = {
  ...v1Handlers,
  deletePet, // add new operation
  createPet: createPetV2, // override old handler
};
apiV2.register(v2Handlers)
```

For a real world API versioning implementation with `openapi-backend`, see
[ether/etherpad](https://github.com/ether/etherpad-lite/blob/39425e4e5bc4579d4b478d3b8b5e92fde55bde86/src/node/hooks/express/openapi.js)
