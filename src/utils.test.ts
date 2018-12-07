import OpenAPIUtils from './utils';

describe('OpenAPIUtils', () => {
  describe('.findStatusCodeMatch', () => {

    test('mismatches', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(302, {
        '200': 'OK',
        '201': 'Created',
      });
      expect(value).toEqual(undefined);
    });

    test('matches 200', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(200, {
        '200': 'OK',
        '201': 'Created',
      });
      expect(value).toEqual('OK');
    });

    test('matches 201', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(201, {
        '200': 'OK',
        '201': 'Created',
      });
      expect(value).toEqual('Created');
    });

    test('matches 404', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(404, {
        '200': 'OK',
        '404': 'Not Found',
        '201': 'Created',
      });
      expect(value).toEqual('Not Found');
    });

    test('matches 500 (not string)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(500, {
        '200': 'OK',
        '500': [ 'a', { test: 'it works' }, 'b' ],
        '201': 'Created',
      });
      expect(value[1].test).toEqual('it works');
    });

    test('matches 500 (null)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(500, {
        '200': 'OK',
        '500': null,
        '201': 'Created',
      });
      expect(value).toEqual(null);
    });

    test('matches 500 (undefined)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(500, {
        '200': 'OK',
        '500': undefined,
        '201': 'Created',
      });
      expect(value).toEqual(undefined);
    });

    test('matches 400 (when pattern present)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(400, {
        '200': 'OK',
        '401': 'Unauthorized',
        '4XX': 'Error (patterned)',
        '400': 'Bad Request',
      });
      expect(value).toEqual('Bad Request');
    });

    test('matches 401 (when pattern present)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(401, {
        '200': 'OK',
        '401': 'Unauthorized',
        '4XX': 'Error (patterned)',
        '400': 'Bad Request',
      });
      expect(value).toEqual('Unauthorized');
    });

    test('matches 403 (via pattern)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(403, {
        '200': 'OK',
        '401': 'Unauthorized',
        '4XX': 'Error (patterned)',
        '400': 'Bad Request',
      });
      expect(value).toEqual('Error (patterned)');
    });

    test('not matches default (on pattern when default present)', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(402, {
        '200': 'OK',
        'default': 'Default value',
        '401': 'Unauthorized',
        '4XX': 'Error (patterned)',
        '400': 'Bad Request',
      });
      expect(value).toEqual('Error (patterned)');
    });

    test('matches default', async () => {
      const value = OpenAPIUtils.findStatusCodeMatch(500, {
        '200': 'OK',
        'default': 'Default value',
        '401': 'Unauthorized',
        '4XX': 'Error (patterned)',
        '400': 'Bad Request',
      });
      expect(value).toEqual('Default value');
    });

    test('wrong pattern fallback', async () => {
      // not even sure this is a relevent test, but let's make sure this doesn't return '200-299 codes'
      const value = OpenAPIUtils.findStatusCodeMatch(23456, {
        '1XX': '100-199 codes',
        '2XX': '200-299 codes',
        '3XX': '300-399 codes',
      });
      expect(value).toEqual(undefined);
    });

  });
});
