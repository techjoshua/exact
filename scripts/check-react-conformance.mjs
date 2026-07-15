import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { capabilityFor, compareConformanceTraces } from "../packages/react-compatibility/dist/index.js";

const root = process.cwd();
const outputDirectory = path.join(root, ".tmp", "react-conformance");
mkdirSync(outputDirectory, { recursive: true });

const reference18 = runReference("@exact/react-reference-18");
const reference19 = runReference("@exact/react-reference-19");
validateVersion(reference18, "18.3");
validateVersion(reference19, "19.2");
validateInventory(reference18);
validateInventory(reference19);
validatePackageFixtureCatalog();
validatePhaseBaseline();
validatePhase1Result();
validatePhase2Result();
validatePhase3Result();
validatePhase4Result();
validatePhase5Result();
validatePhase6Result();
validatePhase1Compatibility();
validatePhase2Compatibility();
validatePhase3Compatibility();
validatePhase4Compatibility();
validatePhase5Compatibility();
validatePhase6Compatibility();
await validateImplementedExports(reference18, 18);
await validateImplementedExports(reference19, 19);

const differences = compareConformanceTraces(reference18, reference19);
if (differences.length) {
  throw new Error(`React reference scenarios diverged:\n${differences.map(value => `  ${value.path}: ${JSON.stringify(value.expected)} != ${JSON.stringify(value.actual)}`).join("\n")}`);
}

writeFileSync(path.join(outputDirectory, "reference-18.json"), `${JSON.stringify(reference18, null, 2)}\n`);
writeFileSync(path.join(outputDirectory, "reference-19.json"), `${JSON.stringify(reference19, null, 2)}\n`);
console.log(`React ${reference18.version} and ${reference19.version} reference traces agree`);
console.log(`Capability inventory covers ${inventorySize(reference18)} React 18 exports and ${inventorySize(reference19)} React 19 exports`);

function runReference(workspace) {
  const npm = npmCommand();
  const output = execFileSync(npm.file, [...npm.args, "run", "trace", "-w", workspace, "--silent"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function runWorkspaceScript(workspace, script) {
  const npm = npmCommand();
  const output = execFileSync(npm.file, [...npm.args, "run", script, "-w", workspace, "--silent"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function runExactPhase1(target) {
  const output = execFileSync(process.execPath, ["scripts/run-exact-react-phase1.mjs", String(target)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function validatePhase1Compatibility() {
  const cases = [
    [runWorkspaceScript("@exact/react-reference-18", "phase1"), runExactPhase1(18)],
    [runWorkspaceScript("@exact/react-reference-19", "phase1"), runExactPhase1(19)]
  ];
  for (const [reference, exact] of cases) {
    const expected = { ...reference, baseline: undefined };
    const actual = { ...exact, baseline: undefined };
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(`React Phase 1 trace diverged for ${reference.baseline}:\nexpected ${JSON.stringify(reference, null, 2)}\nactual ${JSON.stringify(exact, null, 2)}`);
    }
  }
  console.log("React Phase 1 element and shallow-hook traces agree with React 18 and React 19");
}

function validatePhase2Compatibility() {
  const cases = [
    [runWorkspaceScript("@exact/react-reference-18", "phase2"), runExactPhase2(18)],
    [runWorkspaceScript("@exact/react-reference-19", "phase2"), runExactPhase2(19)]
  ];
  for (const [reference, exact] of cases) assertPhaseTrace("Phase 2", reference, exact);
  writeFileSync(path.join(outputDirectory, "phase-2-exact-18.json"), `${JSON.stringify(cases[0][1], null, 2)}\n`);
  writeFileSync(path.join(outputDirectory, "phase-2-exact-19.json"), `${JSON.stringify(cases[1][1], null, 2)}\n`);
  console.log("React Phase 2 context, effect, ref, memo, and external-store traces agree with React 18 and React 19");
}

function validatePhase3Compatibility() {
  const cases = [
    [runWorkspaceScript("@exact/react-reference-18", "phase3"), runExactPhase3(18)],
    [runWorkspaceScript("@exact/react-reference-19", "phase3"), runExactPhase3(19)]
  ];
  for (const [reference, exact] of cases) assertPhaseTrace("Phase 3", reference, exact);
  writeFileSync(path.join(outputDirectory, "phase-3-exact-18.json"), `${JSON.stringify(cases[0][1], null, 2)}\n`);
  writeFileSync(path.join(outputDirectory, "phase-3-exact-19.json"), `${JSON.stringify(cases[1][1], null, 2)}\n`);
  console.log("React Phase 3 portal, Suspense, lazy, deferred-value, and transition traces agree with React 18 and React 19");
}

function validatePhase4Compatibility() {
  const cases = [
    [runWorkspaceScript("@exact/react-reference-18", "phase4"), runExactPhase4(18)],
    [runWorkspaceScript("@exact/react-reference-19", "phase4"), runExactPhase4(19)]
  ];
  for (const [reference, exact] of cases) assertPhaseTrace("Phase 4", reference, exact);
  writeFileSync(path.join(outputDirectory, "phase-4-exact-18.json"), `${JSON.stringify(cases[0][1], null, 2)}\n`);
  writeFileSync(path.join(outputDirectory, "phase-4-exact-19.json"), `${JSON.stringify(cases[1][1], null, 2)}\n`);
  console.log("React Phase 4 class, boundary, PureComponent, lifecycle, and Profiler traces agree with React 18 and React 19");
}

function validatePhase5Compatibility() {
  const cases = [
    [runWorkspaceScript("@exact/react-reference-18", "phase5"), runExactPhase5(18)],
    [runWorkspaceScript("@exact/react-reference-19", "phase5"), runExactPhase5(19)]
  ];
  for (const [reference, exact] of cases) assertPhaseTrace("Phase 5", reference, exact);
  writeFileSync(path.join(outputDirectory, "phase-5-exact-18.json"), `${JSON.stringify(cases[0][1], null, 2)}\n`);
  writeFileSync(path.join(outputDirectory, "phase-5-exact-19.json"), `${JSON.stringify(cases[1][1], null, 2)}\n`);
  console.log("React Phase 5 server markup, pipeable stream, and hydration traces agree with React 18 and React 19");
}

function validatePhase6Compatibility() {
  const cases = [
    [runWorkspaceScript("@exact/react-reference-18", "phase6"), runExactPhase6(18)],
    [runWorkspaceScript("@exact/react-reference-19", "phase6"), runExactPhase6(19)]
  ];
  for (const [reference, exact] of cases) assertPhaseTrace("Phase 6", reference, exact);
  writeFileSync(path.join(outputDirectory, "phase-6-exact-18.json"), `${JSON.stringify(cases[0][1], null, 2)}\n`);
  writeFileSync(path.join(outputDirectory, "phase-6-exact-19.json"), `${JSON.stringify(cases[1][1], null, 2)}\n`);
  console.log("React Phase 6 host serialization, identifiers, resources, and bootstrap traces agree with React 18 and React 19");
}

async function validateImplementedExports(reference, target) {
  const modules = {
    react: await import(pathToFileURL(path.join(root, "packages", "react-compat", "dist", `react${target}.js`)).href),
    "react/jsx-runtime": await import(pathToFileURL(path.join(root, "packages", "react-compat", "dist", `jsx-runtime${target}.js`)).href),
    "react/jsx-dev-runtime": await import(pathToFileURL(path.join(root, "packages", "react-compat", "dist", `jsx-dev-runtime${target}.js`)).href),
    "react-dom": await import(pathToFileURL(path.join(root, "packages", "react-dom-compat", "dist", `react${target}.js`)).href),
    "react-dom/client": await import(pathToFileURL(path.join(root, "packages", "react-dom-compat", "dist", `client${target}.js`)).href)
  };
  modules["react-dom/server"] = await import(pathToFileURL(path.join(root, "packages", "react-dom-compat", "dist", `server${target}.js`)).href);
  if (target === 19) modules["react-dom/static"] = await import(pathToFileURL(path.join(root, "packages", "react-dom-compat", "dist", "static19.js")).href);
  if (target === 19) modules["react/compiler-runtime"] = await import(pathToFileURL(path.join(root, "packages", "react-compat", "dist", "compiler-runtime.js")).href);
  const missing = [];
  for (const [moduleName, implementation] of Object.entries(modules)) {
    for (const name of reference.exports[moduleName] ?? []) {
      const capability = capabilityFor(moduleName, name, reference.baseline);
      if (capability && (capability.status === "supported" || capability.status === "approximate") && !(name in implementation)) {
        missing.push(`${moduleName}:${name}`);
      }
    }
  }
  if (missing.length) throw new Error(`Implemented React ${reference.baseline} capabilities are missing runtime exports:\n  ${missing.join("\n  ")}`);
}

function runExactPhase2(target) {
  const output = execFileSync(process.execPath, ["scripts/run-exact-react-phase2.mjs", String(target)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function runExactPhase3(target) {
  const output = execFileSync(process.execPath, ["scripts/run-exact-react-phase3.mjs", String(target)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function runExactPhase4(target) {
  const output = execFileSync(process.execPath, ["scripts/run-exact-react-phase4.mjs", String(target)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function runExactPhase5(target) {
  const output = execFileSync(process.execPath, ["scripts/run-exact-react-phase5.mjs", String(target)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function runExactPhase6(target) {
  const output = execFileSync(process.execPath, ["scripts/run-exact-react-phase6.mjs", String(target)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(output.trim());
}

function assertPhaseTrace(label, reference, exact) {
  const expected = { ...reference, baseline: undefined };
  const actual = { ...exact, baseline: undefined };
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`React ${label} trace diverged for ${reference.baseline}:\nexpected ${JSON.stringify(reference, null, 2)}\nactual ${JSON.stringify(exact, null, 2)}`);
  }
}

function npmCommand() {
  if (process.env.npm_execpath) return { file: process.execPath, args: [process.env.npm_execpath] };
  if (process.platform !== "win32") return { file: "npm", args: [] };
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "nodejs", "node_modules", "npm", "bin", "npm-cli.js")
  ].filter(Boolean);
  const cli = candidates.find(candidate => existsSync(candidate));
  if (cli) return { file: process.execPath, args: [cli] };
  return { file: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "npm.cmd"] };
}

function validateVersion(trace, baseline) {
  if (trace.baseline !== baseline || !trace.version.startsWith(`${baseline.split(".")[0]}.`)) {
    throw new Error(`Expected React ${baseline} reference, received ${trace.baseline}/${trace.version}`);
  }
}

function validateInventory(trace) {
  const missing = [];
  for (const [module, names] of Object.entries(trace.exports)) {
    for (const name of names) if (!capabilityFor(module, name, trace.baseline)) missing.push(`${module}:${name}`);
  }
  if (missing.length) throw new Error(`Capability manifest is missing ${trace.baseline} exports:\n  ${missing.join("\n  ")}`);
}

function inventorySize(trace) {
  return Object.values(trace.exports).reduce((total, names) => total + names.length, 0);
}

function validatePackageFixtureCatalog() {
  const filename = path.join(root, "packages", "react-compatibility", "package-fixtures.json");
  const catalog = JSON.parse(readFileSync(filename, "utf8"));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.fixtures) || !catalog.fixtures.length) {
    throw new Error("React package fixture catalog is empty or has an unsupported schema");
  }
  const packages = new Set();
  for (const fixture of catalog.fixtures) {
    const identity = `${fixture.package}@${fixture.version ?? "*"}`;
    if (typeof fixture.package !== "string" || packages.has(identity)) throw new Error(`Invalid or duplicate React package fixture ${identity}`);
    if (!Number.isInteger(fixture.phase) || fixture.phase < 1 || fixture.phase > 6) throw new Error(`Invalid phase for React package fixture ${fixture.package}`);
    if (!Array.isArray(fixture.coverage) || !fixture.coverage.length) throw new Error(`Missing coverage for React package fixture ${fixture.package}`);
    packages.add(identity);
  }
}

function validatePhaseBaseline() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-0-baseline.json");
  const baseline = JSON.parse(readFileSync(filename, "utf8"));
  if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.commands) || !baseline.commands.length) {
    throw new Error("React Phase 0 baseline is empty or has an unsupported schema");
  }
  for (const result of baseline.commands) {
    if (typeof result.command !== "string" || typeof result.status !== "string") throw new Error("React Phase 0 baseline contains an invalid command record");
  }
}

function validatePhase1Result() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-1-result.json");
  const result = JSON.parse(readFileSync(filename, "utf8"));
  if (result.schemaVersion !== 1 || result.phase !== 1 || !Array.isArray(result.commands) || !result.commands.length) {
    throw new Error("React Phase 1 result is empty or has an unsupported schema");
  }
  if (!Array.isArray(result.compatibility?.supported) || !Array.isArray(result.compatibility?.deferred)) {
    throw new Error("React Phase 1 result is missing compatibility scope");
  }
}

function validatePhase2Result() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-2-result.json");
  const result = JSON.parse(readFileSync(filename, "utf8"));
  if (result.schemaVersion !== 1 || result.phase !== 2 || !Array.isArray(result.commands) || !result.commands.length) {
    throw new Error("React Phase 2 result is empty or has an unsupported schema");
  }
  if (!Array.isArray(result.compatibility?.supported) || !Array.isArray(result.compatibility?.approximate) || !Array.isArray(result.compatibility?.deferred)) {
    throw new Error("React Phase 2 result is missing compatibility scope");
  }
}

function validatePhase3Result() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-3-result.json");
  const result = JSON.parse(readFileSync(filename, "utf8"));
  if (result.schemaVersion !== 1 || result.phase !== 3 || !Array.isArray(result.commands) || !result.commands.length) {
    throw new Error("React Phase 3 result is empty or has an unsupported schema");
  }
  if (!Array.isArray(result.compatibility?.supported) || !Array.isArray(result.compatibility?.approximate) || !Array.isArray(result.compatibility?.deferred)) {
    throw new Error("React Phase 3 result is missing compatibility scope");
  }
}

function validatePhase4Result() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-4-result.json");
  const result = JSON.parse(readFileSync(filename, "utf8"));
  if (result.schemaVersion !== 1 || result.phase !== 4 || !Array.isArray(result.commands) || !result.commands.length) {
    throw new Error("React Phase 4 result is empty or has an unsupported schema");
  }
  if (!Array.isArray(result.compatibility?.supported) || !Array.isArray(result.compatibility?.approximate) || !Array.isArray(result.compatibility?.deferred)) {
    throw new Error("React Phase 4 result is missing compatibility scope");
  }
}

function validatePhase5Result() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-5-result.json");
  const result = JSON.parse(readFileSync(filename, "utf8"));
  if (result.schemaVersion !== 1 || result.phase !== 5 || !Array.isArray(result.commands) || !result.commands.length) {
    throw new Error("React Phase 5 result is empty or has an unsupported schema");
  }
  if (!Array.isArray(result.compatibility?.supported) || !Array.isArray(result.compatibility?.approximate) || !Array.isArray(result.compatibility?.deferred)) {
    throw new Error("React Phase 5 result is missing compatibility scope");
  }
}

function validatePhase6Result() {
  const filename = path.join(root, "packages", "react-compatibility", "phase-6-result.json");
  const result = JSON.parse(readFileSync(filename, "utf8"));
  if (result.schemaVersion !== 1 || result.phase !== 6 || !Array.isArray(result.commands) || !result.commands.length) {
    throw new Error("React Phase 6 result is empty or has an unsupported schema");
  }
  if (!Array.isArray(result.compatibility?.supported) || !Array.isArray(result.compatibility?.approximate) || !Array.isArray(result.compatibility?.deferred)) {
    throw new Error("React Phase 6 result is missing compatibility scope");
  }
}
