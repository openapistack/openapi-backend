import { App, CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { CorsHttpMethod, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { resolve } from 'path';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

const MAXIMUM_HTTP_API_INTEGRATION_TIMEOUT = Duration.seconds(29);

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const entrypointLambda = new NodejsFunction(this, 'EntrypointLambda', {
      entry: resolve(__dirname, './lambdas/api-entrypoint.lambda.ts'),
      description: 'OpenAPI Backend Entrypoint Lambda',
      // NodeJS LTS with AWS SDK v3
      runtime: Runtime.NODEJS_16_X,
      // Cost-effective Processor Architecture
      // architecture: Architecture.ARM_64,
      architecture: Architecture.X86_64,
      // Maximum time a given endpoint Lambda invoke can take
      timeout: MAXIMUM_HTTP_API_INTEGRATION_TIMEOUT,
      // Lambda code bundling options
      bundling: {
        // Enable Source Map for better error logs
        sourceMap: true,
        // Hook into Commands for adding the OpenAPI Specification to Output
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          // Add the OpenAPI specification to the Lambda bundle
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp "${inputDir}/openapi.yml" "${outputDir}/openapi.yml"`,
          ],
        },
        // Add bundled AWS SDK V3 and CDK dependencies to the externals
        externalModules: ['@aws-sdk/*', '@aws-cdk/*', 'aws-cdk', 'aws-cdk-lib', 'node-fetch'],
      },
    });

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      description: 'OpenAPI Backend Http Api',
      corsPreflight: {
        allowHeaders: ['content-type'],
        allowMethods: [CorsHttpMethod.ANY],
        allowOrigins: ['*'],
      },
    });

    // let's create a separate proxy integration instead of using `$default` integration of `HttpApi`
    // this way; `OPTIONS` requests will be handled by `HttpApi` instead of invoking your Lambda
    // You can opt in to use `defaultIntegration` and change `notFound` to return `204` for `OPTIONS` requests
    httpApi.addRoutes({
      path: '/{proxy+}',
      // ALL methods expect OPTIONS / ANY should be handled by our Lambda
      methods: Object.values(HttpMethod).filter(
        (method) => method !== HttpMethod.OPTIONS && method !== HttpMethod.ANY
      ),
      integration: new HttpLambdaIntegration(
        'OpenAPIBackendIntegration',
        entrypointLambda
      ),
    });

    /* tslint:disable-next-line no-unused-expression */
    new CfnOutput(this, 'OpenAPIBackendHttpApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'OpenAPI Backend Example HttpApi Endpoint',
    });
  }
}

const app = new App();

/* tslint:disable-next-line no-unused-expression */
new MyStack(app, 'openapi-backend-example');

app.synth();
