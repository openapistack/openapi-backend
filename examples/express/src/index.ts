import 'source-map-support/register';
import express from 'express';
import morgan from 'morgan';
import { handler } from './handler';

const port = process.env.PORT || 9000;

export async function startServer() {
  const app = express();

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  app.use(handler);

  const server = await app.listen(port);
  console.info(`listening on ${port}`);
  return { server, app };
}

if (require.main === module) {
  startServer();
}
