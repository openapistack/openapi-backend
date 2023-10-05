import { StackContext, Api } from "sst/constructs";

export function OpenAPI({ stack }: StackContext) {
  const api = new Api(stack, "api", {
    routes: {
      "ANY /{proxy+}": "packages/functions/src/lambda.handler",
    },
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
  });
}
