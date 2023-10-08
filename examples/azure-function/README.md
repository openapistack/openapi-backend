# OpenAPI Backend Serverless Azure Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/openapistack/openapi-backend) on Azure Functions

## QuickStart

Requirements:
- [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools)

```
npm install
npm start # API running at http://localhost:9000
```

Try the endpoints:

```bash
curl -i http://localhost:9000/pets
curl -i http://localhost:9000/pets/1
```

