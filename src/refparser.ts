import $RefParser from '@apidevtools/json-schema-ref-parser';

// fixes issue with newer typescript versions
// https://github.com/APIDevTools/json-schema-ref-parser/issues/139

$RefParser.dereference = $RefParser.dereference.bind($RefParser);
$RefParser.resolve = $RefParser.resolve.bind($RefParser);
$RefParser.parse = $RefParser.parse.bind($RefParser);

const { dereference, parse, resolve } = $RefParser;

export { parse, dereference, resolve };
