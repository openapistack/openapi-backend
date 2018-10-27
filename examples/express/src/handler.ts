import { Request, Response } from 'express';
import OpenAPIBackend from 'openapi-backend';

const dummyHandler = (operationId: string) => async (req: Request, res: Response) => {
  return res.status(200).json({ operationId });
};

const notFoundHandler = async (req: Request, res: Response) => {
  return res.status(404).json({ status: 404, error: 'Not found' });
};

const api = new OpenAPIBackend({
  document: {
    openapi: '3.0.0',
    info: {
      title: 'api',
      version: '1.0.0',
    },
    paths: {
      '/pets': {
        get: {
          operationId: 'getPets',
          responses: {
            200: { description: 'ok' },
          },
        },
      },
      '/pets/{id}': {
        get: {
          operationId: 'getPetById',
          responses: {
            200: { description: 'ok' },
          },
        },
      },
    },
  },
  handlers: {
    getPets: dummyHandler('getPets'),
    getPetById: dummyHandler('getPetById'),
    notFound: notFoundHandler,
  },
});

export async function handler(req: Request, res: Response) {
  api.handleRequest(req, req, res);
}
