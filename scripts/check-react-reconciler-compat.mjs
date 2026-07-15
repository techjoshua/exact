import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const workspace = path.resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(path.join(workspace, ".exact-react-reconciler-"));
const results = [];

try {
  for (const target of [18, 19]) {
    const aliases = new Map([
      ["react", path.join(workspace, `packages/react-compat/dist/react${target}.js`)],
      ["react/jsx-runtime", path.join(workspace, `packages/react-compat/dist/jsx-runtime${target}.js`)],
      ["react/jsx-dev-runtime", path.join(workspace, `packages/react-compat/dist/jsx-dev-runtime${target}.js`)],
      ["react/compiler-runtime", path.join(workspace, "packages/react-compat/dist/compiler-runtime.js")],
      ["react-dom", path.join(workspace, `packages/react-dom-compat/dist/react${target}.js`)],
      ["react-dom/client", path.join(workspace, `packages/react-dom-compat/dist/client${target}.js`)]
    ]);
    const output = path.join(temporary, `renderer-${target}.mjs`);
    const built = await build({
      stdin: {
        contents: `export { runScenario } from "./apps/react-reconciler-reference-${target}/src/scenario.mjs";`,
        resolveDir: workspace,
        sourcefile: `react-reconciler-${target}-entry.mjs`
      },
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      write: false,
      metafile: true,
      plugins: [{
        name: "exact-react-singleton",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^react(?:\/jsx-(?:dev-)?runtime|\/compiler-runtime)?$|^react-dom(?:\/client)?$/ }, args => {
            const replacement = aliases.get(args.path);
            return replacement ? { path: replacement } : undefined;
          });
        }
      }]
    });
    await writeFile(output, built.outputFiles[0].contents);
    const module = await import(`${pathToFileURL(output).href}?run=${Date.now()}`);
    const result = await module.runScenario();
    const inputs = Object.keys(built.metafile.inputs).map(value => value.replaceAll("\\", "/"));
    if (!inputs.some(value => value.endsWith(`/react-compat/dist/react${target}.js`))) throw new Error(`React ${target} compatibility singleton was not bundled`);
    if (!inputs.some(value => value.includes("react-reconciler"))) throw new Error(`React ${target} genuine reconciler was not bundled`);
    if (inputs.some(value => /node_modules\/react\/(?:index|cjs\/react)/.test(value))) throw new Error(`React ${target} genuine React implementation leaked into the compatibility bundle`);
    if (result.afterUnmount !== 0 || !result.effects.includes("cleanup:1")) throw new Error(`React ${target} reconciler cleanup failed`);
    const failedAssertions = Object.entries(result.assertions).filter(([, value]) => !value).map(([name]) => name);
    if (failedAssertions.length > 0) throw new Error(`React ${target} generic reconciler scenarios failed: ${failedAssertions.join(", ")} ${JSON.stringify(result)}`);
    results.push({ ...result, status: "compatible", bundledModules: inputs.length });
  }
  const r3fOutput = path.join(temporary, "r3f-19.mjs");
  const r3fAliases = new Map([
    ["react", path.join(workspace, "packages/react-compat/dist/react19.js")],
    ["react/jsx-runtime", path.join(workspace, "packages/react-compat/dist/jsx-runtime19.js")],
    ["react/jsx-dev-runtime", path.join(workspace, "packages/react-compat/dist/jsx-dev-runtime19.js")],
    ["react-dom", path.join(workspace, "packages/react-dom-compat/dist/react19.js")],
    ["react-dom/client", path.join(workspace, "packages/react-dom-compat/dist/client19.js")]
  ]);
  const r3fBuild = await build({
    stdin: {
      contents: 'export { runR3fScenario } from "./apps/react-reconciler-reference-19/src/r3f-scenario.mjs";',
      resolveDir: workspace,
      sourcefile: "r3f-19-entry.mjs"
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
    metafile: true,
    plugins: [{
      name: "exact-r3f-react-singleton",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react(?:\/jsx-(?:dev-)?runtime)?$|^react-dom(?:\/client)?$/ }, args => {
          const replacement = r3fAliases.get(args.path);
          return replacement ? { path: replacement } : undefined;
        });
      }
    }]
  });
  await writeFile(r3fOutput, r3fBuild.outputFiles[0].contents);
  const r3fModule = await import(`${pathToFileURL(r3fOutput).href}?run=${Date.now()}`);
  const r3f = await r3fModule.runR3fScenario();
  if (!r3f.meshCreated || r3f.updatedPosition !== 2 || r3f.frameCount !== 1 || !r3f.disposed) throw new Error(`R3F compatibility scenario failed: ${JSON.stringify(r3f)}`);
  const canvasOutput = path.join(temporary, "r3f-canvas-19.mjs");
  const canvasBuild = await build({
    stdin: {
      contents: 'export { runCanvasScenario } from "./apps/react-reconciler-reference-19/src/canvas-scenario.mjs";',
      resolveDir: workspace,
      sourcefile: "r3f-canvas-19-entry.mjs"
    },
    bundle: true, format: "esm", platform: "node", target: "node20", write: false,
    external: ["jsdom"],
    banner: { js: 'import { createRequire as __exactCreateRequire } from "node:module"; const require = __exactCreateRequire(import.meta.url);' },
    plugins: [{ name: "exact-r3f-canvas-singleton", setup(buildApi) {
      buildApi.onResolve({ filter: /^react(?:\/jsx-(?:dev-)?runtime)?$|^react-dom(?:\/client)?$/ }, args => {
        const replacement = r3fAliases.get(args.path);
        return replacement ? { path: replacement } : undefined;
      });
    } }]
  });
  await writeFile(canvasOutput, canvasBuild.outputFiles[0].contents);
  const canvasModule = await import(`${pathToFileURL(canvasOutput).href}?run=${Date.now()}`);
  const canvas = await canvasModule.runCanvasScenario();
  if (!canvas.canvasMounted || !canvas.meshCreated || !canvas.contextBridged || canvas.size?.[0] !== 320 || !canvas.disposed || canvas.domAfterUnmount !== 0) throw new Error(`R3F Canvas compatibility scenario failed: ${JSON.stringify(canvas)}`);
  const breadthOutput = path.join(temporary, "renderer-breadth-19.mjs");
  const breadthBuild = await build({
    stdin: {
      contents: 'export { runBreadthScenario } from "./apps/react-reconciler-reference-19/src/breadth-scenario.mjs";',
      resolveDir: workspace,
      sourcefile: "renderer-breadth-19-entry.mjs"
    },
    bundle: true, format: "esm", platform: "node", target: "node20", write: false,
    banner: { js: 'import { createRequire as __exactCreateRequire } from "node:module"; const require = __exactCreateRequire(import.meta.url);' },
    plugins: [{ name: "exact-renderer-breadth-singleton", setup(buildApi) {
      buildApi.onResolve({ filter: /^react(?:\/jsx-(?:dev-)?runtime)?$|^react-dom(?:\/client)?$/ }, args => {
        const replacement = r3fAliases.get(args.path);
        return replacement ? { path: replacement } : undefined;
      });
    } }]
  });
  await writeFile(breadthOutput, breadthBuild.outputFiles[0].contents);
  const breadthModule = await import(`${pathToFileURL(breadthOutput).href}?run=${Date.now()}`);
  const breadth = await breadthModule.runBreadthScenario();
  if (!breadth.ink.renderedInitial || !breadth.ink.renderedUpdate || !breadth.ink.effects.includes("cleanup:1") || breadth.reactPdf.header !== "%PDF" || breadth.reactPdf.bytes < 500) throw new Error(`Renderer breadth scenario failed: ${JSON.stringify(breadth)}`);
  const r3f18Output = path.join(temporary, "r3f-18.mjs");
  const r3f18Aliases = new Map([
    ["react", path.join(workspace, "packages/react-compat/dist/react18.js")],
    ["react/jsx-runtime", path.join(workspace, "packages/react-compat/dist/jsx-runtime18.js")],
    ["react/jsx-dev-runtime", path.join(workspace, "packages/react-compat/dist/jsx-dev-runtime18.js")],
    ["react-dom", path.join(workspace, "packages/react-dom-compat/dist/react18.js")],
    ["react-dom/client", path.join(workspace, "packages/react-dom-compat/dist/client18.js")]
  ]);
  const r3f18Build = await build({
    stdin: { contents: 'export { runR3f18Scenario } from "./apps/react-reconciler-reference-18/src/r3f-scenario.mjs";', resolveDir: workspace, sourcefile: "r3f-18-entry.mjs" },
    bundle: true, format: "esm", platform: "node", target: "node20", write: false,
    plugins: [{ name: "exact-r3f18-singleton", setup(buildApi) {
      buildApi.onResolve({ filter: /^react(?:\/jsx-(?:dev-)?runtime)?$|^react-dom(?:\/client)?$/ }, args => {
        const replacement = r3f18Aliases.get(args.path);
        return replacement ? { path: replacement } : undefined;
      });
    } }]
  });
  await writeFile(r3f18Output, r3f18Build.outputFiles[0].contents);
  const r3f18Module = await import(`${pathToFileURL(r3f18Output).href}?run=${Date.now()}`);
  const r3f18 = await r3f18Module.runR3f18Scenario();
  if (!r3f18.meshCreated || r3f18.updatedPosition !== 3 || r3f18.frameCount !== 1 || !r3f18.disposed) throw new Error(`R3F 18 compatibility scenario failed: ${JSON.stringify(r3f18)}`);
  console.log(JSON.stringify({ schemaVersion: 1, suite: "generic-react-reconciler", results, r3f: { react19: { ...r3f, canvas, status: "compatible" }, react18: { ...r3f18, status: "compatible" } }, breadth }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
