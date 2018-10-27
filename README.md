# OpenAPI Backend Tools
[![Build Status](https://travis-ci.org/anttiviljami/openapi-backend.svg?branch=master)](https://travis-ci.org/anttiviljami/openapi-backend)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Tools for building API backends with the OpenAPI standard

## Quick Start

Full [example projects](https://github.com/anttiviljami/openapi-backend/tree/master/examples) included in the repo

```
npm install --save openapi-backend
```

```javascript
import OpenAPIBackend from 'openapi-backend';

const api = new OpenAPIBackend({
  document: {
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
        post: {
          operationId: 'createPet',
          responses: {
            201: { description: 'ok' },
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
        get: {
          operationId: 'deletePetById',
          responses: {
            200: { description: 'ok' },
          },
        },
      },
    },
  },
  handlers: {
    // your platform specific request handlers here
    getPets: async () => { status: 200, body: 'ok' },
    createPet: async () => { status: 201, body: 'ok' }) },
    getPetById: async () => { status: 200, body: 'ok' }) },
    deletePetById: async () => { status: 200, body: 'ok' }) },
    notFound: async () => { status: 404, body: 'not found' }) },
  },
});
```

### Express

```javascript
import express from 'express';

const app = express();
app.use((req, res) => api.handleRequest(req, req, res));
app.listen(9000);
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

