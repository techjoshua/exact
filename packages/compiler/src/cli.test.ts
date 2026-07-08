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
});
