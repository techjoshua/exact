import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("exactc", () => {
  it("compiles TSX files through the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-cli-"));
    const input = path.join(root, "src", "view.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, "const view = <span />;");

    await execFileAsync(process.execPath, [
      path.resolve("packages/compiler/dist/cli.js"),
      "--rootDir",
      path.join(root, "src"),
      "--outDir",
      outDir,
      input
    ]);

    const output = await readFile(path.join(outDir, "view.ts"), "utf8");
    expect(output).toContain("__exactVNode(\"span\"");
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
      path.resolve("packages/compiler/dist/cli.js"),
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
});
