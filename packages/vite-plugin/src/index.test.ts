import { describe, expect, it } from "vitest";
import { exact } from "./index.js";

describe("@exact/vite-plugin", () => {
  it("transforms matching tsx files", () => {
    const plugin = exact();
    const result = plugin.transform("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
  });

  it("passes compiler targets through to transformed files", () => {
    const plugin = exact({ target: "client" });
    const result = plugin.transform(`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `, "/src/page.tsx");

    expect(result?.code).not.toContain("node:fs/promises");
    expect(result?.code).not.toContain("readFile");
  });

  it("honors include and exclude filters", () => {
    expect(exact({ include: "/src/" }).transform("const view = <span />;", "/src/view.tsx")).not.toBeNull();
    expect(exact({ include: "/src/" }).transform("const view = <span />;", "/test/view.tsx")).toBeNull();
    expect(exact({ exclude: /ignored/ }).transform("const view = <span />;", "/src/ignored.tsx")).toBeNull();
  });

  it("skips node_modules unless explicitly included", () => {
    expect(exact().transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).toBeNull();
    expect(exact({ include: "node_modules/lib" }).transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).not.toBeNull();
  });

  it("adds filename context to transform errors", () => {
    const plugin = exact();

    expect(() => plugin.transform("const view = <span>;", "/src/broken.tsx")).toThrow(/eXact JSX transform failed for \/src\/broken\.tsx/);
  });
});
