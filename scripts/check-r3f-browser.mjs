import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";

const workspace = path.resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(path.join(workspace, ".exact-r3f-browser-"));
const aliases = new Map([
  ["react", path.join(workspace, "packages/react-compat/dist/react19.js")],
  ["react/jsx-runtime", path.join(workspace, "packages/react-compat/dist/jsx-runtime19.js")],
  ["react/jsx-dev-runtime", path.join(workspace, "packages/react-compat/dist/jsx-dev-runtime19.js")],
  ["react-dom", path.join(workspace, "packages/react-dom-compat/dist/react19.js")],
  ["react-dom/client", path.join(workspace, "packages/react-dom-compat/dist/client19.js")]
]);

let server;
try {
  await build({
    entryPoints: [path.join(workspace, "apps/react-reconciler-reference-19/src/browser-scenario.mjs")],
    outfile: path.join(temporary, "scenario.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    plugins: [{ name: "exact-r3f-browser-singleton", setup(buildApi) {
      buildApi.onResolve({ filter: /^react(?:\/jsx-(?:dev-)?runtime)?$|^react-dom(?:\/client)?$/ }, args => {
        const replacement = aliases.get(args.path);
        return replacement ? { path: replacement } : undefined;
      });
    } }]
  });
  await writeFile(path.join(temporary, "index.html"), '<!doctype html><style>html,body,#root{width:320px;height:240px;margin:0}</style><div id="root"></div><script type="module" src="/scenario.js"></script>');

  server = createServer(async (request, response) => {
    const file = request.url === "/scenario.js" ? "scenario.js" : "index.html";
    response.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
    response.end(await readFile(path.join(temporary, file)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const results = [];

  for (const [name, browserType] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    let browser;
    try {
      browser = await browserType.launch({ headless: true, args: name === "chromium" ? ["--use-angle=swiftshader", "--enable-webgl", "--enable-precise-memory-info", "--js-flags=--expose-gc"] : [] });
    } catch (error) {
      results.push({ browser: name, status: "unavailable", reason: String(error).split("\n")[0] });
      continue;
    }
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForFunction(() => window.__exactR3fBrowser?.done, null, { timeout: 15_000 });
      const result = await page.evaluate(() => window.__exactR3fBrowser);
      const cyclesPassed = result.cycles.length === 5 && result.cycles.every(cycle => cycle.passed);
      const memoryPassed = name === "chromium" ? result.memoryBudgetPassed : true;
      const passed = cyclesPassed && memoryPassed && result.errors.length === 0;
      results.push({ browser: name, status: passed ? "passed" : "failed", ...result });
      if (!passed) throw new Error(`${name} R3F browser gate failed: ${JSON.stringify(result)}`);
    } finally {
      await browser.close();
    }
  }
  const incomplete = results.filter(result => result.status !== "passed");
  if (results.length !== 3 || incomplete.length > 0) {
    throw new Error(`Every declared browser must pass the real-WebGL R3F gate: ${JSON.stringify(incomplete)}`);
  }
  console.log(JSON.stringify({ schemaVersion: 1, suite: "r3f-real-browser", results }, null, 2));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
