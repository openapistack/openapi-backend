import type { AsyncHandler } from '@aws-lambda-powertools/commons';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context as LambdaContext,
} from 'aws-lambda';
import OpenAPIBackend, { Context as OpenAPIContext } from 'openapi-backend';
import petsSpec from '../openapi.json';

const headers = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*', // lazy cors config
};

const api = new OpenAPIBackend({ definition: petsSpec as any, quick: true });

// register swagger handlers by operation id
api.register({
  notFound: async (_: OpenAPIContext, __: APIGatewayProxyEvent, ___: LambdaContext) => ({
    statusCode: 404,
    body: JSON.stringify({ err: 'not found' }),
    headers,
  }),
  validationFail: async (c: OpenAPIContext, _: APIGatewayProxyEvent, __: LambdaContext) => ({
    statusCode: 400,
    body: JSON.stringify({ err: c.validation.errors }),
    headers,
  }),
  getPets: async (c: OpenAPIContext, _: APIGatewayProxyEvent, __: LambdaContext) => ({
    statusCode: 200,
    body: JSON.stringify({ operationId: c.operation.operationId }),
    headers,
  }),
  getPetById: async (c: OpenAPIContext, _: APIGatewayProxyEvent, __: LambdaContext) => ({
    statusCode: 200,
    body: JSON.stringify({ operationId: c.operation.operationId }),
    headers,
  }),
});

api.init().catch((err) => {
  console.error(err);
  process.exit(1);
});

export const handler: AsyncHandler<APIGatewayProxyHandler> =
  async (event: APIGatewayProxyEvent, context: LambdaContext): Promise<APIGatewayProxyResult> => {
    return api.handleRequest(
      {
        method: event.httpMethod,
        path: event.path,
        // @ts-ignore
        query: event.queryStringParameters ?? undefined,
        body: event.body,
        // @ts-ignore
        headers: event.headers,
      },
      event,
      context,
    );
  };
