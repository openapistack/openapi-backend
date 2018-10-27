import 'source-map-support/register';
import Hapi from 'hapi';
import Good from 'good';

import { handler } from './handler';

const port = process.env.PORT || 9000;

export async function startServer() {
  const server = new Hapi.Server({ host: '0.0.0.0', port });

  await server.register({
    plugin: Good,
    options: {
      reporters: {
        access: [
          {
            module: 'good-squeeze',
            name: 'Squeeze',
            args: [{ response: '*' }],
          },
          {
            module: 'good-console',
          },
          'stdout',
        ],
      },
    },
  });

  server.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    path: '/{path*}',
    handler,
  });

  await server.start();
  console.info(`listening on ${server.info.uri}`);
  return server;
}

if (require.main === module) {
  startServer();
}
