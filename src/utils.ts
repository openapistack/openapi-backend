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
  public static findStatusCodeMatch(statusCode: number, obj: {[patternedStatusCode: string]: any}): any {

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
}
