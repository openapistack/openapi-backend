const { spawn } = require('child_process');
const waitOn = require('wait-on');
const axios = require('axios');
const jwt = require('jsonwebtoken');

jest.setTimeout(30000);

describe('express jwt example', () => {
  let start;
  let client;

  beforeAll(async () => {
    client = axios.create({ baseURL: 'http://localhost:9000', validateStatus: () => true });
    start = spawn('npm', ['start'], { cwd: __dirname, detached: true, stdio: 'inherit' });
    await waitOn({ resources: ['tcp:localhost:9000'] });
  });

  afterAll(() => process.kill(-start.pid));

  describe('with valid jwt token', () => {
    const payload = { user: 'John Doe' };
    const token = jwt.sign(payload, 'secret');
    beforeAll(() => {
      client.defaults.headers.common['Authorization'] = token;
    });

    test('GET /me returns 200 with token data', async () => {
      const res = await client.get('/me');
      expect(res.status).toBe(200);
      expect(res.data.user).toEqual(payload.user);
    });
  });

  describe('without authorization header', () => {
    beforeAll(() => {
      client.defaults.headers.common['Authorization'] = null;
    });

    test('GET /me returns 401', async () => {
      const res = await client.get('/me');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });

    test('GET /login returns 200 with new jwt token', async () => {
      const res = await client.get('/login');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('token');
    });
  });

  describe('with invalid jwt token', () => {
    beforeAll(() => {
      client.defaults.headers.common['Authorization'] = '<invalid token>';
    });

    test('GET /me returns 401', async () => {
      const res = await client.get('/me');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('err');
    });

    test('GET /login returns 200 with new jwt token', async () => {
      const res = await client.get('/login');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('token');
    });
  });
});
