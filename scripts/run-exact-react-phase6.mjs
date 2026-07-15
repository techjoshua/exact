import { collectReactPhase6Trace } from "./react-phase6-scenario.mjs";

const target = process.argv[2];
if (target !== "18" && target !== "19") throw new Error("Expected React compatibility target 18 or 19");
const React = await import(new URL(`../packages/react-compat/dist/react${target}.js`, import.meta.url).href);
const ReactDOM = await import(new URL(`../packages/react-dom-compat/dist/react${target}.js`, import.meta.url).href);
const ReactDOMServer = await import(new URL(`../packages/react-dom-compat/dist/server${target}.js`, import.meta.url).href);
const result = await collectReactPhase6Trace({ React, ReactDOM, ReactDOMServer, baseline: `${target}-exact` });
process.stdout.write(`${JSON.stringify(result)}\n`);
