import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReactCompatibilityBuildEngine } from "../packages/react-compat/dist/build.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../framework-adapters/vite-plugin/test-fixtures/adapter-app");
const start = performance.now();
const engine = createReactCompatibilityBuildEngine({ cwd: root, target: 18 });
const report = engine.report();
const discovered = performance.now();
const irrelevant = "export const value = 1;";
const relevant = 'import { QueryClientProvider } from "@tanstack/react-query"; export { QueryClientProvider };';
for (let index = 0; index < 10_000; index++) engine.transformModule({ id: `/irrelevant-${index}.js`, source: irrelevant, format: "module", target: "client", sourceMap: false });
const fastPath = performance.now();
for (let index = 0; index < 1_000; index++) engine.transformModule({ id: `/relevant-${index}.js`, source: relevant, format: "module", target: "client", sourceMap: false });
const transformed = performance.now();

console.log(JSON.stringify({
  adapters: report.activeAdapters.length,
  substitutions: report.substitutions.length,
  coldDiscoveryMs: discovered - start,
  irrelevantTransformsPerSecond: 10_000 / ((fastPath - discovered) / 1_000),
  relevantTransformsPerSecond: 1_000 / ((transformed - fastPath) / 1_000)
}, null, 2));
