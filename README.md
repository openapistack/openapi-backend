<h1 align="center"><img alt="openapi-backend" src="./header.png" style="max-width:50rem"></h1>

[![CI](https://github.com/anttiviljami/openapi-backend/workflows/CI/badge.svg)](https://github.com/anttiviljami/openapi-backend/actions?query=workflow%3ACI)
[![Dependencies](https://david-dm.org/anttiviljami/openapi-backend.svg)](https://david-dm.org/anttiviljami/openapi-backend)
[![npm version](https://img.shields.io/npm/v/openapi-backend.svg)](https://www.npmjs.com/package/openapi-backend)
[![npm downloads](https://img.shields.io/npm/dw/openapi-backend)](https://www.npmjs.com/package/openapi-backend)
[![Total alerts](https://img.shields.io/lgtm/alerts/g/anttiviljami/openapi-backend.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/anttiviljami/openapi-backend/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/anttiviljami/openapi-backend.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/anttiviljami/openapi-backend/context:javascript)
[![License](http://img.shields.io/:license-mit-blue.svg)](https://github.com/anttiviljami/openapi-backend/blob/master/LICENSE)
[![Sponsored](https://img.shields.io/badge/chilicorn-sponsored-brightgreen.svg?logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAA4AAAAPCAMAAADjyg5GAAABqlBMVEUAAAAzmTM3pEn%2FSTGhVSY4ZD43STdOXk5lSGAyhz41iz8xkz2HUCWFFhTFFRUzZDvbIB00Zzoyfj9zlHY0ZzmMfY0ydT0zjj92l3qjeR3dNSkoZp4ykEAzjT8ylUBlgj0yiT0ymECkwKjWqAyjuqcghpUykD%2BUQCKoQyAHb%2BgylkAyl0EynkEzmkA0mUA3mj86oUg7oUo8n0k%2FS%2Bw%2Fo0xBnE5BpU9Br0ZKo1ZLmFZOjEhesGljuzllqW50tH14aS14qm17mX9%2Bx4GAgUCEx02JySqOvpSXvI%2BYvp2orqmpzeGrQh%2Bsr6yssa2ttK6v0bKxMBy01bm4zLu5yry7yb29x77BzMPCxsLEzMXFxsXGx8fI3PLJ08vKysrKy8rL2s3MzczOH8LR0dHW19bX19fZ2dna2trc3Nzd3d3d3t3f39%2FgtZTg4ODi4uLj4%2BPlGxLl5eXm5ubnRzPn5%2Bfo6Ojp6enqfmzq6urr6%2Bvt7e3t7u3uDwvugwbu7u7v6Obv8fDz8%2FP09PT2igP29vb4%2BPj6y376%2Bu%2F7%2Bfv9%2Ff39%2Fv3%2BkAH%2FAwf%2FtwD%2F9wCyh1KfAAAAKXRSTlMABQ4VGykqLjVCTVNgdXuHj5Kaq62vt77ExNPX2%2Bju8vX6%2Bvr7%2FP7%2B%2FiiUMfUAAADTSURBVAjXBcFRTsIwHAfgX%2FtvOyjdYDUsRkFjTIwkPvjiOTyX9%2FAIJt7BF570BopEdHOOstHS%2BX0s439RGwnfuB5gSFOZAgDqjQOBivtGkCc7j%2B2e8XNzefWSu%2BsZUD1QfoTq0y6mZsUSvIkRoGYnHu6Yc63pDCjiSNE2kYLdCUAWVmK4zsxzO%2BQQFxNs5b479NHXopkbWX9U3PAwWAVSY%2FpZf1udQ7rfUpQ1CzurDPpwo16Ff2cMWjuFHX9qCV0Y0Ok4Jvh63IABUNnktl%2B6sgP%2BARIxSrT%2FMhLlAAAAAElFTkSuQmCC)](http://spiceprogram.org/oss-sponsorship)
[![Buy me a coffee](https://img.shields.io/badge/donate-buy%20me%20a%20coffee-orange)](https://buymeacoff.ee/anttiviljami)

<p align="center"><b>Build, Validate, Route, Authenticate, and Mock using OpenAPI definitions.</b></p>

<p align="center">OpenAPI Backend is a Framework-agnostic middleware tool for building beautiful APIs with <a href="https://github.com/OAI/OpenAPI-Specification">OpenAPI Specification</a>.</p>

## Features

- [x] Build APIs by describing them in [OpenAPI specification](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md)
- [x] Register handlers for [operationIds](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#fixed-fields-8)
to route requests in your favourite Node.js backend
- [x] Use [JSON Schema](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#data-types) to validate
API requests and/or responses. OpenAPI Backend uses the [AJV](https://ajv.js.org/) library under the hood for performant validation
- [x] Register Auth / Security Handlers for [OpenAPI Security Schemes](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securitySchemeObject)
to authorize API requests
- [x] Auto-mock API responses using [OpenAPI examples objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#example-object)
or [JSON Schema definitions](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#schema-object)
- [x] Built with TypeScript, types included

(Currently only OpenAPI v3.0.0+ is supported)

## Documentation

See [DOCS.md](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md)

## Quick Start

Full [example projects](https://github.com/anttiviljami/openapi-backend/tree/master/examples) included in the repo

```
npm install --save openapi-backend
```

```javascript
import OpenAPIBackend from 'openapi-backend';

// create api with your definition file or object
const api = new OpenAPIBackend({ definition: './petstore.yml' });

// register your framework specific request handlers here
api.register({
  getPets: (c, req, res) => res.status(200).json({ result: 'ok' }),
  getPetById: (c, req, res) => res.status(200).json({ result: 'ok' }),
  validationFail: (c, req, res) => res.status(400).json({ err: c.validation.errors }),
  notFound: (c, req, res) => res.status(404).json({ err: 'not found' }),
});

// initalize the backend
api.init();
```

### Express

```javascript
import express from 'express';

const app = express();
app.use(express.json());
app.use((req, res) => api.handleRequest(req, req, res));
app.listen(9000);
```

[See full Express example](https://github.com/anttiviljami/openapi-backend/tree/master/examples/express)

### AWS Serverless (Lambda)

```javascript
// API Gateway Proxy handler
module.exports.handler = (event, context) =>
  api.handleRequest(
    {
      method: event.httpMethod,
      path: event.path,
      query: event.queryStringParameters,
      body: event.body,
      headers: event.headers,
    },
    event,
    context,
  );
```

[See full AWS SAM example](https://github.com/anttiviljami/openapi-backend/tree/master/examples/aws-sam)

[See full Serverless Framework example](https://github.com/anttiviljami/openapi-backend/tree/master/examples/serverless-framework)

### Azure Function

```javascript
module.exports = (context, req) =>
  api.handleRequest(
    {
      method: req.method,
      path: req.params.path,
      query: req.query,
      body: req.body,
      headers: req.headers,
    },
    context,
    req,
  );
```

[See full Azure Function example](https://github.com/anttiviljami/openapi-backend/tree/master/examples/azure-function)

### Hapi

```javascript
import Hapi from 'hapi';

const server = new Hapi.Server({ host: '0.0.0.0', port: 9000 });
server.route({
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  path: '/{path*}',
  handler: (req, h) =>
    api.handleRequest(
      {
        method: req.method,
        path: req.path,
        body: req.payload,
        query: req.query,
        headers: req.headers,
      },
      req,
      h,
    ),
});
server.start();
```

[See full Hapi example](https://github.com/anttiviljami/openapi-backend/tree/master/examples/hapi-typescript)


### Koa

```javascript
import Koa from 'koa';
import bodyparser from 'koa-bodyparser';

const app = new Koa();

app.use(bodyparser());
app.use((ctx) =>
  api.handleRequest(
    ctx.request,
    ctx,
  ),
);
app.listen(9000);
```

[See full Koa example](https://github.com/anttiviljami/openapi-backend/tree/master/examples/koa)

## Registering Handlers for Operations

Handlers are registered for [`operationIds`](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#fixed-fields-8)
found in the OpenAPI definitions. You can register handlers as shown above with [`new OpenAPIBackend()`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#parameter-optshandlers)
constructor opts, or using the [`register()`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#registeroperationid-handler)
method.

```javascript
async function getPetByIdHandler(c, req, res) {
  const id = c.request.params.id;
  const pet = await pets.getPetById(id);
  return res.status(200).json({ result: pet });
}
api.register('getPetById', getPetByIdHandler);
// or
api.register({
  getPetById: getPetByIdHandler,
});
```

Operation handlers are passed a special [Context object](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#context-object)
as the first argument, which contains the parsed request, the
matched API operation and input validation results. The other arguments in the example above are Express-specific
handler arguments.

## Request validation

The easiest way to enable request validation in your API is to register a [`validationFail`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#validationfail-handler)
handler.

```javascript
function validationFailHandler(c, req, res) {
  return res.status(400).json({ status: 400, err: c.validation.errors });
}
api.register('validationFail', validationFailHandler);
```

Once registered, this handler gets called if any JSON Schemas in either operation parameters (in: path, query, header,
cookie) or requestPayload don't match the request.

The context object `c` gets a `validation` property with the [validation result](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#validationresult-object).

## Response validation

OpenAPIBackend doesn't automatically perform response validation for your handlers, but you can register a
[`postResponseHandler`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#postresponsehandler-handler)
to add a response validation step using [`validateResponse`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#validateresponseres-operation).

```javascript
api.register({
  getPets: (c) => {
    // when a postResponseHandler is registered, your operation handlers' return value gets passed to context.response
    return [{ id: 1, name: 'Garfield' }];
  },
  postResponseHandler: (c, req, res) => {
    const valid = c.api.validateResponse(c.response, c.operation);
    if (valid.errors) {
      // response validation failed
      return res.status(502).json({ status: 502, err: valid.errors });
    }
    return res.status(200).json(c.response);
  },
});
```

It's also possible to validate the response headers using [`validateResponseHeaders`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#validateresponseheadersheaders-operation-opts).

```javascript
api.register({
  getPets: (c) => {
    // when a postResponseHandler is registered, your operation handlers' return value gets passed to context.response
    return [{ id: 1, name: 'Garfield' }];
  },
  postResponseHandler: (c, req, res) => {
    const valid = c.api.validateResponseHeaders(res.headers, c.operation, {
      statusCode: res.statusCode,
      setMatchType: 'exact',
    });
    if (valid.errors) {
      // response validation failed
      return res.status(502).json({ status: 502, err: valid.errors });
    }
    return res.status(200).json(c.response);
  },
});
```

## Auth / Security Handlers

If your OpenAPI definition contains [Security Schemes](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securitySchemeObject)
you can register security handlers to handle authorization for your API:

```yaml
components:
  securitySchemes:
  - ApiKey:
      type: apiKey
      in: header
      name: x-api-key
security:
  - ApiKey: []
```

```javascript
api.registerSecurityHandler('ApiKey', (c) => {
  const authorized = c.request.headers['x-api-key'] === 'SuperSecretPassword123';
  // truthy return values are interpreted as auth success
  // you can also add any auth information to the return value
  return authorized;
});
```

The authorization status and return values of each security handler can be
accessed via the [Context Object](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#context-object)

You can also register an [`unauthorizedHandler`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#unauthorizedhandler-handler)
to handle unauthorized requests.

```javascript
api.register('unauthorizedHandler', (c, req, res) => {
  return res.status(401).json({ err: 'unauthorized' })
});
```

See examples:
- [API Key auth (express)](https://github.com/anttiviljami/openapi-backend/tree/master/examples/express-apikey-auth)
- [JWT auth (express)](https://github.com/anttiviljami/openapi-backend/tree/master/examples/express-jwt-auth)

## Mocking API responses

Mocking APIs just got really easy with OpenAPI Backend! Register a [`notImplemented`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#notimplemented-handler)
handler and use [`mockResponseForOperation()`](https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md##mockresponseforoperationoperationid-opts)
to generate mock responses for operations with no custom handlers specified yet:

```javascript
api.register('notImplemented', (c, req, res) => {
  const { status, mock } = c.api.mockResponseForOperation(c.operation.operationId);
  return res.status(status).json(mock);
});
```

OpenAPI Backend supports mocking responses using both OpenAPI example objects and JSON Schema:
```yaml
paths:
  '/pets':
    get:
      operationId: getPets
      summary: List pets
      responses:
        200:
          $ref: '#/components/responses/PetListWithExample'
  '/pets/{id}':
    get:
      operationId: getPetById
      summary: Get pet by its id
      responses:
        200:
          $ref: '#/components/responses/PetResponseWithSchema'
components:
  responses:
    PetListWithExample:
      description: List of pets
      content:
        'application/json':
          example:
            - id: 1
              name: Garfield
            - id: 2
              name: Odie
    PetResponseWithSchema:
      description: A single pet
      content:
        'application/json':
          schema:
            type: object
            properties:
              id:
                type: integer
                minimum: 1
              name:
                type: string
                example: Garfield
```

The example above will yield:
```javascript
api.mockResponseForOperation('getPets'); // => { status: 200, mock: [{ id: 1, name: 'Garfield' }, { id: 2, name: 'Odie' }]}
api.mockResponseForOperation('getPetById'); // => { status: 200, mock: { id: 1, name: 'Garfield' }}
```

[See full Mock API example on Express](https://github.com/anttiviljami/openapi-backend/tree/master/examples/express-ts-mock)

## Contributing

OpenAPI Backend is Free and Open Source Software. Issues and pull requests are more than welcome!

[<img alt="The Chilicorn" src="http://spiceprogram.org/assets/img/chilicorn_sticker.svg" width="250" height="250">](https://spiceprogram.org/oss-sponsorship)

