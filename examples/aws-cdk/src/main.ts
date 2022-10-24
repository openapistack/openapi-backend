import { resolve } from 'path';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { ApiDefinition, SpecRestApi } from 'aws-cdk-lib/aws-apigateway';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

import petStoreSpecJSON from './openapi.json';

const petStoreSpec = petStoreSpecJSON as any;

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const baseFunc = new NodejsFunction(this, 'baseFunc', {
      runtime: Runtime.NODEJS_16_X,
      handler: 'handler',
      entry: resolve(__dirname, './lambdas/entrypoint.ts'),
    });

    Object.keys(petStoreSpec.paths).forEach(path => Object.keys(petStoreSpec.paths[path]).forEach(method => {
      const operation = petStoreSpec.paths[path][method];

      operation['x-amazon-apigateway-integration'] = {
        uri: `arn:${this.partition}:apigateway:${this.region}:lambda:path/2015-03-31/functions/${baseFunc.functionArn}/invocations`,
        responses: {
          default: {
            statusCode: '200',
          },
        },
        passthroughBehavior: 'when_no_match',
        httpMethod: 'POST',
        contentHandling: 'CONVERT_TO_TEXT',
        type: 'aws_proxy',
      };
    }));

    const specRestApi = new SpecRestApi(this, 'oapiSpecRestApi', {
      restApiName: 'Open API Spec Rest API',
      apiDefinition: ApiDefinition.fromInline(petStoreSpec),
    });

    baseFunc.addPermission('PermitAPIGWInvocation', {
      principal: new ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: specRestApi.arnForExecuteApi('*'),
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, 'openapi-backend-aws-cdk-dev', { env: devEnv });
// new MyStack(app, 'openapi-backend-aws-cdk-prod', { env: prodEnv });

app.synth();
