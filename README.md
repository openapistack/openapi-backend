# openapi-backend examples

Example projects showing how to use [openapi-backend](https://github.com/openapistack/openapi-backend) with different Node.js frameworks and serverless platforms.

These live on the `examples` branch, separate from the library source on `main`, so that dependency scanning and Dependabot for the library are not polluted by example project dependencies.

## Examples

- [express](./express)
- [express-typescript](./express-typescript)
- [express-ts-mock](./express-ts-mock) - Mock API on Express
- [express-apikey-auth](./express-apikey-auth) - API Key auth
- [express-jwt-auth](./express-jwt-auth) - JWT auth
- [fastify](./fastify)
- [hapi-typescript](./hapi-typescript)
- [koa](./koa)
- [bun](./bun)
- [aws-sam](./aws-sam)
- [aws-cdk](./aws-cdk)
- [aws-sst](./aws-sst)
- [serverless-framework](./serverless-framework)
- [azure-function](./azure-function)

## Running an example

```sh
git clone --branch examples --single-branch https://github.com/openapistack/openapi-backend.git openapi-backend-examples
cd openapi-backend-examples/express
npm install
npm start
```

## Contributing

Open pull requests against the `examples` branch. CI checks out `main` and links the library into each example before running its tests.
