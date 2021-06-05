const { spawn } = require('child_process');
const waitOn = require('wait-on');
const axios = require('axios');

jest.setTimeout(30000);

describe('express example', () => {
  let start;
  let client;

  beforeAll(async () => {
    client = axios.create({ baseURL: 'http://localhost:9000', validateStatus: () => true });
    start = spawn('npm', ['start'], { cwd: __dirname, detached: true, stdio: 'inherit' });
    await waitOn({ resources: ['tcp:localhost:9000'] });
  });

  afterAll(() => process.kill(-start.pid));

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
