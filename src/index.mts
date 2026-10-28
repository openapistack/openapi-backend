// native ESM entrypoint, re-exports the CommonJS build to avoid dual package hazard
import { OpenAPIBackend } from './index.js';

export default OpenAPIBackend;

export * from './index.js';
