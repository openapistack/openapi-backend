# OpenAPI Backend
[![Build Status](https://travis-ci.org/anttiviljami/openapi-backend.svg?branch=master)](https://travis-ci.org/anttiviljami/openapi-backend)
[![npm version](https://img.shields.io/npm/v/openapi-backend.svg)](https://www.npmjs.com/package/openapi-backend)
[![License](http://img.shields.io/:license-mit-blue.svg)](https://github.com/anttiviljami/openapi-backend/blob/master/LICENSE)
[![Sponsored](https://img.shields.io/badge/chilicorn-sponsored-brightgreen.svg?logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAA4AAAAPCAMAAADjyg5GAAABqlBMVEUAAAAzmTM3pEn%2FSTGhVSY4ZD43STdOXk5lSGAyhz41iz8xkz2HUCWFFhTFFRUzZDvbIB00Zzoyfj9zlHY0ZzmMfY0ydT0zjj92l3qjeR3dNSkoZp4ykEAzjT8ylUBlgj0yiT0ymECkwKjWqAyjuqcghpUykD%2BUQCKoQyAHb%2BgylkAyl0EynkEzmkA0mUA3mj86oUg7oUo8n0k%2FS%2Bw%2Fo0xBnE5BpU9Br0ZKo1ZLmFZOjEhesGljuzllqW50tH14aS14qm17mX9%2Bx4GAgUCEx02JySqOvpSXvI%2BYvp2orqmpzeGrQh%2Bsr6yssa2ttK6v0bKxMBy01bm4zLu5yry7yb29x77BzMPCxsLEzMXFxsXGx8fI3PLJ08vKysrKy8rL2s3MzczOH8LR0dHW19bX19fZ2dna2trc3Nzd3d3d3t3f39%2FgtZTg4ODi4uLj4%2BPlGxLl5eXm5ubnRzPn5%2Bfo6Ojp6enqfmzq6urr6%2Bvt7e3t7u3uDwvugwbu7u7v6Obv8fDz8%2FP09PT2igP29vb4%2BPj6y376%2Bu%2F7%2Bfv9%2Ff39%2Fv3%2BkAH%2FAwf%2FtwD%2F9wCyh1KfAAAAKXRSTlMABQ4VGykqLjVCTVNgdXuHj5Kaq62vt77ExNPX2%2Bju8vX6%2Bvr7%2FP7%2B%2FiiUMfUAAADTSURBVAjXBcFRTsIwHAfgX%2FtvOyjdYDUsRkFjTIwkPvjiOTyX9%2FAIJt7BF570BopEdHOOstHS%2BX0s439RGwnfuB5gSFOZAgDqjQOBivtGkCc7j%2B2e8XNzefWSu%2BsZUD1QfoTq0y6mZsUSvIkRoGYnHu6Yc63pDCjiSNE2kYLdCUAWVmK4zsxzO%2BQQFxNs5b479NHXopkbWX9U3PAwWAVSY%2FpZf1udQ7rfUpQ1CzurDPpwo16Ff2cMWjuFHX9qCV0Y0Ok4Jvh63IABUNnktl%2B6sgP%2BARIxSrT%2FMhLlAAAAAElFTkSuQmCC)](http://spiceprogram.org/oss-sponsorship)

Non-opinionated middleware tools for building APIs with the [OpenAPI standard](https://github.com/OAI/OpenAPI-Specification)
in your favourite Node.js backends and frameworks.

Includes routing, validation and mocking functionality.

## Features

- Build APIs by describing them in [OpenAPI document specification](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md)
and importing them via YAML or JSON files or as a JS object
- Register handlers for API operations for routing in your favourite Node.js backend like [Express](#express),
[Hapi](#hapi), [AWS Lambda](#aws-serverless-lambda) or [Azure Functions](#azure-serverless-function)
- Use [JSON Schema](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#data-types) to validate
API requests. OpenAPI Backend uses the [AJV](https://ajv.js.org/) library under the hood for performant validation

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

const api = new OpenAPIBackend({
  definition: {
    openapi: '3.0.0',
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
  },
  handlers: {
    // your platform specific request handlers here
    getPets: async (req) => ({ status: 200, body: 'ok' }),
    getPetById: async (req) => ({ status: 200, body: 'ok' }),
    notFound: async (req) => ({ status: 404, body: 'not found' }),
    validationFail: async (err, req) => ({ status: 400, body: JSON.stringify({ err }) }),
  },
});

// initalize the backend
api.init();
```

### Express

```javascript
import express from 'express';

const app = express();
app.use((req, res) => api.handleRequest(req, req, res));
app.listen(9000);
```

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

### Azure Serverless Function

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

## Contributing

OpenAPI Backend is Free and Open Source Software. Issues and pull requests are more than welcome!

[<img alt="The Chilicorn" src="http://spiceprogram.org/assets/img/chilicorn_sticker.svg" width="250" height="250">](https://spiceprogram.org/oss-sponsorship)

