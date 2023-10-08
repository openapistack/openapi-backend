# OpenAPI Backend AWS CDK Example

[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/openapistack/openapi-backend) with [AWS CDK](https://aws.amazon.com/cdk/)

## QuickStart

### Requirements

- NodeJS and NPM
- AWS and AWS CDK
- (optional) [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-reference.html#serverless-sam-cli) (>= v1.65) and [Docker](https://docs.docker.com/get-docker/) for local `npm start` and `npm test`

#### AWS Authentication

Make sure to set up your AWS authentication correctly. This example assume you are using AWS SSO profiles, make sure you are authenticated with the correct profile. E.g. `aws sso login --profile your-profile`

#### CDK Bootstrap

To use this example, you need to make sure CDK is bootstrapped for your AWS account and region.

```bash
AWS_PROFILE=your-profile npx cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_DEFAULT_REGION
```

### Run and Test

```bash
AWS_PROFILE=your-profile npx cdk deploy
```

To try the endpoints, first copy the API GW URL that the `npx cdk deploy` command has outputted. The output will look like;

```
openapi-backend-example.OpenAPIBackendHttpApiEndpoint = https://ie88ixpq7g.execute-api.eu-west-1.amazonaws.com
```

Set an environment variable for making the further calls easier:
```bash
export CDK_OUTPUT_API_GW_URL=https://ie88ixpq7g.execute-api.eu-west-1.amazonaws.com
```

Try the endpoints:

```bash
curl -i "$CDK_OUTPUT_API_GW_URL/pets"
curl -i "$CDK_OUTPUT_API_GW_URL/pets/1"
```

### Clean Up the Resources

If you would like to remove the example from your AWS account, run:

```bash
AWS_PROFILE=your-profile npx cdk destroy
```

## ! IMPORTANT ! Caveats with the Example

- [HttpApi CORS Settings](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html) related problems maybe hard to troubleshoot. If you are calling endpoints with `OPTIONS` method manually, make sure you are providing all necessary request headers(E.g. `Origin`, `Access-Control-Request-Method`) properly. Otherwise, you will get `204 No Content` response without any proper CORS response headers.
- You may use `$default` integration of `HttpApi` if you don't need to set up CORS for your API, or you would like to set up CORS on application side.
- `source-map-support/register` takes a signification amount of time to convert error stacktraces to proper ones. You may want to optimize or disable `source-map-support` when deploying to production environment.
