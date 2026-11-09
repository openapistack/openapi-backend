import { spawn } from 'node:child_process';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';

const endpoint = '127.0.0.1:9001';

describe('aws-lambda-web-functions example', () => {
  let server;

  const get = async (path) => {
    const res = await fetch(`http://${endpoint}${path}`);
    return { status: res.status, data: await res.json() };
  };

  beforeAll(async () => {
    // simulate the Lambda runtime: run index.js with AWS_LAMBDA_HTTP_ENDPOINT set
    server = spawn(process.execPath, ['index.js'], {
      cwd: import.meta.dirname,
      env: { ...process.env, AWS_LAMBDA_HTTP_ENDPOINT: endpoint },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      server.stdout.on('data', (chunk) => chunk.includes('api listening') && resolve());
      server.on('exit', (code) => reject(new Error(`server exited with code ${code}`)));
    });
  });

  afterAll(() => server.kill());

  test('GET /pets returns 200 with matched operation', async () => {
    const res = await get('/pets');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ operationId: 'getPets' });
  });

  test('GET /pets/1 returns 200 with matched operation', async () => {
    const res = await get('/pets/1');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ operationId: 'getPetById' });
  });

  test('GET /pets/1a returns 400 with validation error', async () => {
    const res = await get('/pets/1a');
    expect(res.status).toBe(400);
    expect(res.data).toHaveProperty('err');
  });

  test('GET /unknown returns 404', async () => {
    const res = await get('/unknown');
    expect(res.status).toBe(404);
    expect(res.data).toHaveProperty('err');
  });
});
