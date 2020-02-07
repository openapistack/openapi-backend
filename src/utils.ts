import * as _ from 'lodash';

export default class OpenAPIUtils {
  /**
   * Finds the value for a given key (status code) in an object,
   * based on the OpenAPI specification for patterned field.
   * Returns the value in the 'obj' argument for which the key matches the 'statusCode' argument,
   * based on pattern matching, or undefined otherwise.
   * @param {number} statusCode The status code representing the key to match in 'obj' argument.
   * @param {Object.<string, *>} obj The object containing values referenced by possibly patterned status code key.
   * @returns {*}
   */
  public static findStatusCodeMatch(statusCode: number, obj: { [patternedStatusCode: string]: any }): any {
    let value: any = obj[statusCode];

    if (value !== undefined) {
      return value;
    }

    // The specification allows statusCode to be 1XX, 2XX, ...
    const strStatusCode = Math.floor(statusCode / 100) + 'XX';

    value = obj[strStatusCode];

    if (value !== undefined) {
      return value;
    }

    return obj['default'];
  }

  /**
   * Finds the default most appropriate value in an object, based on the following rule
   * 1. check for a 20X res
   * 2. check for a 2XX res
   * 3. check for the "default" res
   * 4. pick first res code in list
   * Returns the value in the 'obj' argument.
   * @param {Object.<string, *>} obj The object containing values referenced by possibly patterned status code key.
   * @returns {{status: string, res: *}}
   */
  public static findDefaultStatusCodeMatch(obj: { [patternedStatusCode: string]: any }): { status: number; res: any } {
    // 1. check for a 20X response
    for (const ok of _.range(200, 204)) {
      if (obj[ok]) {
        return {
          status: ok,
          res: obj[ok],
        };
      }
    }

    // 2. check for a 2XX response
    if (obj['2XX']) {
      return {
        status: 200,
        res: obj['2XX'],
      };
    }

    // 3. check for the "default" response
    if (obj.default) {
      return {
        status: 200,
        res: obj.default,
      };
    }

    // 4. pick first response code in list
    const code = Object.keys(obj)[0];
    return {
      status: Number(code),
      res: obj[code],
    };
  }
}
