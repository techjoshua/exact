import path from "node:path";
import { performance } from "node:perf_hooks";
import { createExpressionProject, expressions, rewriteModule } from "../packages/expressions/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const project = createExpressionProject({ tsconfigPath: path.join(root, "apps/kanban/tsconfig.json") });
const filename = path.join(root, "apps/kanban/src/__expressions_benchmark.tsx");
const records = Array.from({ length: 1_000 }, (_, index) => `const value${index} = source.items.filter(item => item.index === ${index}).map(item => item.value);`).join("\n");
const source = `declare const source: { items: { index: number; value: string }[] };\n${records}\nexport const view = <section>{value999.join(",")}</section>;`;
const module = project.updateModule(filename, source);

const bindingFilename = path.join(root, "apps/kanban/src/__expressions_binding_benchmark.ts");
project.updateModule(bindingFilename, "export const revision = 0;");
const bindingStarted = performance.now();
for (let revision = 1; revision <= 20; revision++) {
  project.updateModule(bindingFilename, `export const revision = ${revision};`);
}
const bindingMs = performance.now() - bindingStarted;

const queryStarted = performance.now();
let matches = 0;
for (let index = 0; index < 100; index++) {
  matches += module.walk().calls().where(call => call.target?.isMember("filter") === true).toArray().length;
}
const queryMs = performance.now() - queryStarted;

const replacement = expressions.module("replacement.ts").literal(2_000);
const rewriteStarted = performance.now();
const rewritten = rewriteModule(module, rewriter => {
  rewriter.replaceWhere(ref => ref.node.text === "999", () => replacement);
});
const rewriteMs = performance.now() - rewriteStarted;

if (matches !== 100_000) throw new Error(`Unexpected expression query result: ${matches}`);
if (!rewritten.emit().code.includes("=== 2000")) throw new Error("Expression rewrite did not update the selected literal");
if (queryMs > 750) throw new Error(`Expression query budget exceeded: ${queryMs.toFixed(1)}ms > 750ms`);
if (rewriteMs > 500) throw new Error(`Expression rewrite budget exceeded: ${rewriteMs.toFixed(1)}ms > 500ms`);
if (bindingMs > 750) throw new Error(`Expression incremental binding budget exceeded: ${bindingMs.toFixed(1)}ms > 750ms`);

console.log(`expression queries (100 x 1k calls): ${queryMs.toFixed(1)}ms`);
console.log(`expression single-node rewrite (1k records): ${rewriteMs.toFixed(1)}ms`);
console.log(`expression incremental binding (20 updates): ${bindingMs.toFixed(1)}ms`);
