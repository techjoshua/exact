import { register } from "node:module";

// Node's stable registration entry point; use with
// `node --import @exact/react-compat/register`.
register("./node-loader.js", import.meta.url);
