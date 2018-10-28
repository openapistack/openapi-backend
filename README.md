# OpenAPI Backend
[![Build Status](https://travis-ci.org/anttiviljami/openapi-backend.svg?branch=master)](https://travis-ci.org/anttiviljami/openapi-backend)
[![npm version](https://badge.fury.io/js/openapi-backend.svg)](https://badge.fury.io/js/openapi-backend)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Tools for building API backends with the [OpenAPI standard](https://github.com/OAI/OpenAPI-Specification)

## Features

- Build APIs by describing them in [OpenAPI document specification](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md)
and importing them via YAML, JSON or as a JavaScript object
- Register handlers for API operations in your favourite Node.js backend like [Express](#express), [Hapi](#hapi),
[AWS Lambda](#aws-serverless-lambda) or [Azure Functions](#azure-serverless-function)
- Use [JSON Schema](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#data-types) to validate
API requests. OpenAPI Backend uses the [AJV](https://ajv.js.org/) library under the hood for performant validation

## Quick Start

Full [example projects](https://github.com/anttiviljami/openapi-backend/tree/master/examples) included in the repo

```
npm install --save openapi-backend
```

```javascript
import OpenAPIBackend from 'openapi-backend';

const api = new OpenAPIBackend({
  definition: {
    openapi: '3.0.2',
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
          responses: {
            200: { description: 'ok' },
          },
        },
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
      method: req.httpMethod,
      path: req.params.path,
      query: req.queryStringParameters,
      body: req.body,
      headers: req.headers,
    },
    context,
    req,
  );
```

