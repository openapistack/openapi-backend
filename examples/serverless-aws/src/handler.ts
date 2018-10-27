import 'source-map-support/register';
import { APIGatewayProxyEvent } from 'aws-lambda';

export async function api(event: APIGatewayProxyEvent) {
  const { httpMethod, path, queryStringParameters, body, headers } = event;
  return {
    statusCode: 200,
    body: JSON.stringify({ httpMethod, path, queryStringParameters, body, headers }),
  };
}
