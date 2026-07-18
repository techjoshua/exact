import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");

describe("exactc", { timeout: 15_000 }, () => {
  it("compiles TSX files through the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-cli-"));
    const input = path.join(root, "src", "view.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, "const view = <span />;");

    await execFileAsync(process.execPath, [
      cliPath,
      "--rootDir",
      path.join(root, "src"),
      "--outDir",
      outDir,
      input
    ]);

    const output = await readFile(path.join(outDir, "view.ts"), "utf8");
    expect(output).toContain("__exactVNode(\"span\"");
  });

  it("emits source maps through the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-cli-map-"));
    const input = path.join(root, "src", "view.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, "const view = <span />;");

    await execFileAsync(process.execPath, [
      cliPath,
      "--rootDir",
      path.join(root, "src"),
      "--outDir",
      outDir,
      "--sourceMap",
      input
    ]);

    const output = await readFile(path.join(outDir, "view.ts"), "utf8");
    const map = JSON.parse(await readFile(path.join(outDir, "view.ts.map"), "utf8"));

    expect(output).toContain("//# sourceMappingURL=view.ts.map");
    expect(map.file).toBe("view.ts");
    expect(map.sources).toEqual([input]);
  });

  it("emits manifests and honors target flags through the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-cli-manifest-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string; width?: number }>) {
        this.task(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        this.task(() => {
          this.state.width = window.innerWidth;
        });
        return () => <h1>{this.state.title}</h1>;
      }
    `);

    await execFileAsync(process.execPath, [
      cliPath,
      "--rootDir",
      path.join(root, "src"),
      "--outDir",
      outDir,
      "--target",
      "client",
      "--manifest",
      input
    ]);

    const output = await readFile(path.join(outDir, "page.ts"), "utf8");
    const manifest = JSON.parse(await readFile(path.join(outDir, "page.exact.json"), "utf8"));

    expect(output).not.toContain("node:fs/promises");
    expect(output).toContain("window.innerWidth");
    expect(Object.keys(manifest.serverActions)).toHaveLength(1);
  });

  it("emits paired target artifacts through the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-cli-artifacts-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string; width?: number }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        this.task.client(() => {
          this.state.width = window.innerWidth;
        });
        return () => <h1>{this.state.title}</h1>;
      }
    `);

    await execFileAsync(process.execPath, [
      cliPath,
      "--rootDir",
      path.join(root, "src"),
      "--outDir",
      outDir,
      "--artifacts",
      input
    ]);

    const client = await readFile(path.join(outDir, "page.exact.client.ts"), "utf8");
    const server = await readFile(path.join(outDir, "page.exact.server.ts"), "utf8");
    const manifest = JSON.parse(await readFile(path.join(outDir, "page.exact.manifest.json"), "utf8"));

    expect(client).not.toContain("node:fs/promises");
    expect(client).toContain("window.innerWidth");
    expect(server).toContain("node:fs/promises");
    expect(server).not.toContain("window.innerWidth");
    expect(Object.keys(manifest.serverActions)).toHaveLength(1);
  });

  it("emits server component client artifacts through the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-cli-server-components-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";
      export function Page(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("page.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `);

    await execFileAsync(process.execPath, [
      cliPath,
      "--rootDir",
      path.join(root, "src"),
      "--outDir",
      outDir,
      "--artifacts",
      "--serverComponents",
      input
    ]);

    const client = await readFile(path.join(outDir, "page.exact.client.ts"), "utf8");
    const server = await readFile(path.join(outDir, "page.exact.server.ts"), "utf8");

    expect(client).toContain("Page_ExactClient_1");
    expect(client).not.toContain("export function Page(");
    expect(client).not.toContain("node:fs/promises");
    expect(server).toMatch(/export const Page: typeof __exactImplementation_Page_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
    expect(server).toContain("__exactBoundary");
  });
});
