import {$} from 'bun';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { Subprocess } from 'bun';
import {test, expect, describe, beforeAll, afterAll} from "bun:test";

async function waitForPort(port: number, retryInterval = 1000, timeout = 30000) {
  const start = Date.now();

  while (true) {
    try {
      // Attempt to fetch from the server
      await fetch(`http://localhost:${port}`);
      // If successful, the port is open; break out of the loop
      console.log(`Port ${port} is now open.`);
      break;
    } catch (e) {
      // If there's an error (likely connection refused), the port isn't open yet
      if (Date.now() - start > timeout) {
        // If we've exceeded our timeout, throw an error
        throw new Error(`Timeout waiting for port ${port}`);
      }
      // Wait for `retryInterval` milliseconds before trying again
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
}

describe('bun-ts example', () => {
  let proc: Subprocess<"ignore", "pipe", "inherit">;
  let client: AxiosInstance;

  beforeAll(async () => {
    client = axios.create({ baseURL: 'http://localhost:9000', validateStatus: () => true  });
    proc = Bun.spawn(["bun", "run", "index.ts"]);
    proc.unref();

    await waitForPort(9000);
  });

  afterAll(async () => {
    proc.kill();
  });

  test('GET /pets returns 200 with matched operation', async () => {
    const res = await client.get('/pets');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ operationId: 'getPets' });
  });

  test('GET /pets/1 returns 200 with matched operation', async () => {
    const res = await client.get('/pets/1');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ operationId: 'getPetById' });
  });

  test('GET /pets/1a returns 400 with validation error', async () => {
    const res = await client.get('/pets/1a');
    expect(res.status).toBe(400);
    expect(res.data).toHaveProperty('err');
  });

  test('GET /unknown returns 404', async () => {
    const res = await client.get('/unknown');
    expect(res.status).toBe(404);
    expect(res.data).toHaveProperty('err');
  });
});
