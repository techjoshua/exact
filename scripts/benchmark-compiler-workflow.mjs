import path from "node:path";
import { performance } from "node:perf_hooks";
import { createCompilerSession, transformSource } from "../packages/compiler/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const filename = path.join(root, "apps/kanban/src/__compiler_workflow_benchmark.tsx");
const warmups = 2;
const samples = 10;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function source(revision) {
  return `
    export function Benchmark(this: Component<{ count: number }>) {
      const revision = ${revision};
      return () => <button title={"revision-" + revision}>{this.state.count}</button>;
    }
  `;
}

function measure(generatedValidation) {
  const session = createCompilerSession();
  for (let index = 0; index < warmups; index++) {
    transformSource(source(-index), { filename, session, generatedValidation });
  }
  const timings = [];
  for (let index = 0; index < samples; index++) {
    const started = performance.now();
    transformSource(source(index), { filename, session, generatedValidation });
    timings.push(performance.now() - started);
  }
  const stats = session.stats();
  session.dispose();
  return {
    median: percentile(timings, 0.5),
    p95: percentile(timings, 0.95),
    rebuilds: stats.rebuilds,
    semanticDiagnostics: stats.semanticDiagnostics
  };
}

const semantic = measure("semantic");
const syntax = measure("syntax");

console.log(`compiler generated semantic validation (${samples} samples): median ${semantic.median.toFixed(1)}ms, p95 ${semantic.p95.toFixed(1)}ms, ${semantic.rebuilds} rebuilds, ${semantic.semanticDiagnostics} semantic diagnostic passes`);
console.log(`compiler generated syntax validation (${samples} samples): median ${syntax.median.toFixed(1)}ms, p95 ${syntax.p95.toFixed(1)}ms, ${syntax.rebuilds} rebuilds, ${syntax.semanticDiagnostics} semantic diagnostic passes`);
console.log(`compiler syntax/semantic median ratio: ${(syntax.median / semantic.median).toFixed(2)}x`);
