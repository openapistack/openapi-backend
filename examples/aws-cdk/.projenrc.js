const { awscdk, javascript } = require('projen');

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'openapi-backend-aws-cdk',
  packageManager: javascript.NodePackageManager.NPM,
  description: 'Example project using openapi-backend on AWS CDK',

  github: false,
  deps: ['aws-cdk-lib', 'aws-lambda', 'openapi-backend'],
  devDeps: ['@types/aws-lambda', '@aws-lambda-powertools/commons'],
});

project.synth();
