import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// runs the built package (npm run build) in a separate node process, like a consumer would
const rootDir = path.join(__dirname, '..');
const isBuilt = existsSync(path.join(rootDir, 'index.js'));
const definition = path.join(rootDir, '__tests__', 'resources', 'example-pet-api.openapi.yml');

// AWS Lambda runs node with require(esm) disabled
// https://github.com/openapistack/openapi-backend/issues/1042
const nodeFlags = process.allowedNodeEnvironmentFlags.has('--experimental-require-module')
  ? ['--no-experimental-require-module']
  : [];

const runNode = (args: string[]) =>
  execFileSync(process.execPath, [...nodeFlags, ...args], { cwd: rootDir, encoding: 'utf8' }).trim();

describe.skipIf(!isBuilt)('module compatibility', () => {
  test('loads and initializes from CommonJS without require(esm)', () => {
    const script = `
      const OpenAPIBackend = require('./index.js').default;
      const { OpenAPIRouter } = require('./router.js');
      const api = new OpenAPIBackend({ definition: ${JSON.stringify(definition)} });
      api.init().then(() => console.log(api.router.getOperations().length, typeof OpenAPIRouter));
    `;
    expect(runNode(['-e', script])).toEqual('8 function');
  });
});
