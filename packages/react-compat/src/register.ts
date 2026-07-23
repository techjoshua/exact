import { register } from 'node:module';

// Node's stable registration entry point; use with
// `node --import @exactjs/react-compat/register`.
register('./node-loader.js', import.meta.url);
