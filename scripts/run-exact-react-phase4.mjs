import { JSDOM } from "jsdom";
import { collectReactPhase4Trace } from "./react-phase4-scenario.mjs";

const target = process.argv[2];
if (target !== "18" && target !== "19") throw new Error("Expected React compatibility target 18 or 19");
const React = await import(new URL(`../packages/react-compat/dist/react${target}.js`, import.meta.url).href);
const ReactDOMClient = await import(new URL(`../packages/react-dom-compat/dist/client${target}.js`, import.meta.url).href);
const result = await collectReactPhase4Trace({ React, ReactDOMClient, JSDOM, baseline: `${target}-exact` });
process.stdout.write(`${JSON.stringify(result)}\n`);
