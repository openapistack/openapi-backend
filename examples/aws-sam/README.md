# OpenAPI Backend AWS SAM Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/openapistack/openapi-backend) on [AWS SAM](https://aws.amazon.com/serverless/sam/)

## QuickStart

Requirements:
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-reference.html#serverless-sam-cli)
- [Docker](https://docs.docker.com/get-docker/)

```
npm install
npm start # API running at http://localhost:3000
```

Try the endpoints:

```bash
curl -i http://localhost:3000/pets
curl -i http://localhost:3000/pets/1
```

