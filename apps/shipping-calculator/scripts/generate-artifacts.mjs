import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compileProjectArtifacts,
  createExactArtifactGraph,
  createExactArtifactRegistryModules
} from "@exact/compiler";

const root = path.resolve("src");
const outDir = path.resolve(".exact");
await mkdir(outDir, { recursive: true });
const results = await compileProjectArtifacts([path.join(root, "App.tsx")], {
  rootDir: root,
  outDir,
  filename: "src/App.tsx",
  serverComponents: true,
  sourceMap: true
});
const packageRoot = path.resolve(".");
const graph = createExactArtifactGraph(results, { packageRoot, sourceRoot: root, rootDir: packageRoot });
createExactArtifactRegistryModules(graph, {
  clientExportName: "exactClientIslands",
  serverExportName: "exactServerParts"
});
for (const result of results) {
  for (const artifact of [result.clientFile, result.serverFile]) {
    const source = await readFile(artifact, "utf8");
    await writeFile(artifact, source.replaceAll('from "./', 'from "../src/'), "utf8");
  }
}
await writeFile(path.join(outDir, "client-registry.ts"), 'import { CalculatorWorkspace } from "./App.exact.client.js";\nexport const exactClientIslands = { CalculatorWorkspace };\n', "utf8");
await writeFile(path.join(outDir, "server-registry.ts"), 'import { ShippingCalculatorPage } from "./App.exact.server.js";\nexport const exactServerParts = { ShippingCalculatorPage };\n', "utf8");
console.log(`Generated ${results.length} eXact component artifact set`);
