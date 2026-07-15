import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import { JSDOM } from "jsdom";
import { benchmarkReactReference, collectReactReferenceTrace } from "../../../scripts/react-reference-scenario.mjs";
import { collectReactPhase1Trace } from "../../../scripts/react-phase1-scenario.mjs";
import { collectReactPhase2Trace } from "../../../scripts/react-phase2-scenario.mjs";
import { collectReactPhase3Trace } from "../../../scripts/react-phase3-scenario.mjs";
import { collectReactPhase4Trace } from "../../../scripts/react-phase4-scenario.mjs";
import { collectReactPhase5Trace } from "../../../scripts/react-phase5-scenario.mjs";
import { collectReactPhase6Trace } from "../../../scripts/react-phase6-scenario.mjs";

const result = process.argv.includes("--phase6")
  ? await collectReactPhase6Trace({ React, ReactDOM, ReactDOMServer, baseline: "18.3" })
  : process.argv.includes("--phase5")
  ? await collectReactPhase5Trace({ React, ReactDOMClient, ReactDOMServer, JSDOM, baseline: "18.3" })
  : process.argv.includes("--phase4")
  ? await collectReactPhase4Trace({ React, ReactDOMClient, JSDOM, baseline: "18.3" })
  : process.argv.includes("--phase3")
  ? await collectReactPhase3Trace({ React, ReactDOM, ReactDOMClient, JSDOM, baseline: "18.3" })
  : process.argv.includes("--phase2")
  ? await collectReactPhase2Trace({ React, ReactDOMClient, JSDOM, baseline: "18.3" })
  : process.argv.includes("--phase1")
  ? await collectReactPhase1Trace({ React, ReactDOMClient, JSDOM, baseline: "18.3" })
  : process.argv.includes("--benchmark")
  ? benchmarkReactReference({ React, ReactDOMServer, baseline: "18.3" })
  : await collectReactReferenceTrace({ React, ReactDOM, ReactDOMClient, ReactDOMServer, ReactJsxRuntime, ReactJsxDevRuntime, JSDOM, baseline: "18.3" });
process.stdout.write(`${JSON.stringify(result)}\n`);
