import fs from 'fs';
import path from 'path';
import OpenAPIBackend from '../src/index';

const documentPath = path.join(__dirname, 'resources', 'example-pet-api.openapi.json');
const document = JSON.parse(fs.readFileSync(documentPath).toString());

describe('OpenAPIBackend', () => {
  test('can be initalised with a valid OpenAPI document', async () => {
    const opts = { document };
    expect(new OpenAPIBackend(opts)).toBeInstanceOf(OpenAPIBackend);
  });

  test('throws an error when initalised with an invalid document', async () => {
    const opts: any = { document: { invalid: 'not openapi' } };
    expect(() => new OpenAPIBackend(opts)).toThrowError();
  });
});
