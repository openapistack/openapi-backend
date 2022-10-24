# OpenAPI Backend AWS CDK Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/anttiviljami/openapi-backend) on [AWS CDK](https://aws.amazon.com/cdk/)

## QuickStart

### Requirements
- NodeJS and NPM
- AWS

#### Environment Variables
Make sure to set up your AWS authentication correctly. If you are using SSO / profiles, make sure you are authenticated with the correct profile.

This example only has two custom env variables you need to set:

```bash
export CDK_DEFAULT_ACCOUNT=your-aws-account 
export CDK_DEFAULT_REGION=your-default-region
```

### Run and Test

```bash
npx projen deploy
```

To try the endpoints, first copy the API GW URL that the `npx project deploy` command has outputted. The output will look like;

```
openapi-backend-aws-cdk-dev.oapiSpecRestApiEndpoint = https://random.execute-api.ap-southeast-1.amazonaws.com/prod/
```

Set an environment variable for making the further calls easier:
```bash
export CDK_OUTPUT_API_GW_URL=https://random.execute-api.ap-southeast-1.amazonaws.com/prod/
```

Try the endpoints:

```bash
curl -i "$CDK_OUTPUT_API_GW_URL/pets"
curl -i "$CDK_OUTPUT_API_GW_URL/pets/1"
```

