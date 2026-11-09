# OpenAPI Backend AWS Lambda Web Functions Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/openapistack/openapi-backend) on [AWS Lambda Web Functions](https://aws.amazon.com/blogs/aws/announcing-aws-lambda-web-functions-for-fast-consistent-web-app-performance-anywhere/)

Web Functions run a plain Node.js HTTP server, so this is just [Express](https://expressjs.com/) + openapi-backend listening on the address Lambda provides in `AWS_LAMBDA_HTTP_ENDPOINT`. No Lambda event adapter needed.

## QuickStart

```
npm install
npm start # API running at http://127.0.0.1:9000
```

Run it on the address Lambda would give it:

```
AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:3000 npm start
```

Try the endpoints:

```bash
curl -i http://127.0.0.1:9000/pets
curl -i http://127.0.0.1:9000/pets/1
```

## Deploy

Requirements:
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) with the `aws lambda-web` commands (`aws lambda-web help`)
- AWS credentials and a region where Web Functions are available

```
npm run deploy
```

This stages `index.js`, `openapi.yml` and production dependencies into `build/`, then runs `aws lambda-web deploy --name openapi-backend-example --code build`. The runtime loads `index.js` from the package root. The command prints the HTTPS endpoint URL:

```bash
curl -i https://<domain-id>.<shard-id>.lambda-web.<region>.on.aws/pets
```

Clean up:

```
aws lambda-web delete-web-function --function-name openapi-backend-example
```
