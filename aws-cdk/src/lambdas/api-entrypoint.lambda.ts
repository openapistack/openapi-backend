import 'source-map-support/register';
import type * as Lambda from 'aws-lambda';
import OpenAPIBackend from 'openapi-backend';

const DEFAULT_HEADERS = {
  'content-type': 'application/json',
};

const openAPIBackend = new OpenAPIBackend({
  // spec file is put to the `process.cwd()/openapi.yml` by AWS CDK configuration
  definition: './openapi.yml',
  // recommended for optimizing cold start
  quick: true,
});

// register some handlers
openAPIBackend.register({
  notFound: async (_c, _event: Lambda.APIGatewayProxyEvent, _context: Lambda.Context) => ({
    statusCode: 404,
    body: JSON.stringify({ err: 'not found' }),
    headers: DEFAULT_HEADERS,
  }),
  validationFail: async (c, _event: Lambda.APIGatewayProxyEvent, _context: Lambda.Context) => ({
    statusCode: 400,
    body: JSON.stringify({ err: c.validation.errors }),
    headers: DEFAULT_HEADERS,
  }),
  getPets: async (c, _event: Lambda.APIGatewayProxyEvent, _context: Lambda.Context) => ({
    statusCode: 200,
    body: JSON.stringify({ operationId: c.operation.operationId }),
    headers: DEFAULT_HEADERS,
  }),
  getPetById: async (c, _event: Lambda.APIGatewayProxyEvent, _context: Lambda.Context) => ({
    statusCode: 200,
    body: JSON.stringify({
      operationId: c.operation.operationId,
      id: c.request.params.id,
    }),
    headers: DEFAULT_HEADERS,
  }),
});

// call and cache result of `factoryFunc` and create a new func that always returns the cached version
const oncePromise = <T>(factoryFunc: () => Promise<T>): (() => Promise<T>) => {
  const cache = factoryFunc();

  return () => cache;
};

const getAPI = oncePromise(() => openAPIBackend.init());

export async function handler(
  event: Lambda.APIGatewayProxyEventV2,
  context: Lambda.Context
): Promise<Lambda.APIGatewayProxyResultV2> {
  const api = await getAPI();

  return api.handleRequest(
    {
      method: event.requestContext.http.method,
      path: event.requestContext.http.path,
      query: event.queryStringParameters as Record<string, string | string[]>,
      body: event.body,
      headers: event.headers as Record<string, string | string[]>,
    },
    event,
    context
  );
}
