import { Request, Response } from 'express';

export async function handler(req: Request, res: Response) {
  const { method, path, query, body, headers } = req;
  return res.status(200)
    .end(JSON.stringify({ method, path, query, body, headers }));
}
