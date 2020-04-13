const { spawn } = require('child_process');
const waitOn = require('wait-on');
const axios = require('axios');

jest.setTimeout(30000);

describe('express api key auth example', () => {
  let start;
  let client;

  beforeAll(async () => {
    client = axios.create({ baseURL: 'http://localhost:9000', validateStatus: () => true });
    start = spawn('npm', ['start'], { cwd: __dirname, detached: true });
    await waitOn({ resources: ['tcp:localhost:9000'] });
  });

  afterAll(() => process.kill(-start.pid));

  describe('without api key', () => {
    beforeAll(() => {
      client.defaults.headers.common['x-api-key'] = null;
    });

    test('GET /pets returns 401 error', async () => {
      const res = await client.get('/pets');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });

    test('GET /pets/1 returns 401 error', async () => {
      const res = await client.get('/pets/1');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });

    test('GET /pets/1a returns 401 error', async () => {
      const res = await client.get('/pets/1a');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });
  });

  describe('with correct api key', () => {
    beforeAll(() => {
      client.defaults.headers.common['x-api-key'] = 'secret';
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
  });

  describe('with incorrect api key', () => {
    beforeAll(() => {
      client.defaults.headers.common['x-api-key'] = '<wrong apikey>';
    });

    test('GET /pets returns 401 error', async () => {
      const res = await client.get('/pets');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });

    test('GET /pets/1 returns 401 error', async () => {
      const res = await client.get('/pets/1');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });

    test('GET /pets/1a returns 401 error', async () => {
      const res = await client.get('/pets/1a');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });
  });
});
