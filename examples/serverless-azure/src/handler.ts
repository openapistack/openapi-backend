import 'source-map-support/register';
import { Context, HttpRequest } from 'azure-functions-ts-essentials';

export async function api(context: Context, req: HttpRequest) {
  const { method, params, query, body, headers } = req;
  context.res = {
    status: 200,
    body: JSON.stringify({ method, params, query, body, headers }),
  };
}
