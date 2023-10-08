# OpenAPI Backend API Key Auth Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/openapistack/openapi-backend) on [Express](https://expressjs.com/)

## QuickStart

```
npm install
npm start # API running at http://localhost:9000
```

Try the endpoints:

```bash
curl -i http://localhost:9000/pets -H x-api-key:secret
curl -i http://localhost:9000/pets/1 -H x-api-key:secret
```

