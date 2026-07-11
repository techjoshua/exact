import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExactWebpackPlugin,
  addWebpackConditions,
  createExactWebpackRule,
  resolveExactWebpackRequest,
  transformExactWebpackSource,
  type WebpackCompilerLike
} from "./index.js";

describe("@exact/webpack-plugin", () => {
  it("transforms matching TSX sources through the shared compiler", () => {
    const result = transformExactWebpackSource("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
  });

  it("passes target options through to transforms", () => {
    const result = transformExactWebpackSource(`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `, "/src/page.tsx", { target: "client" });

    expect(result?.code).not.toContain("node:fs/promises");
  });

  it("resolves exact facade imports through shared artifact resolution", () => {
    expect(resolveExactWebpackRequest("./Panel.exact", "/app/src/main.ts", { target: "server" })).toBe(path.resolve("/app/src/Panel.exact.server.ts"));
    expect(resolveExactWebpackRequest("./Panel", "/app/src/main.ts")).toBeNull();
  });

  it("adds export conditions without duplicating existing conditions", () => {
    const compiler: WebpackCompilerLike = { options: { resolve: { conditionNames: ["browser", "exact-client"] } } };

    addWebpackConditions(compiler, ["exact-client"]);

    expect(compiler.options.resolve?.conditionNames).toEqual(["exact-client", "browser"]);
  });

  it("creates a pre-loader rule", () => {
    expect(createExactWebpackRule({ target: "server" })).toMatchObject({
      enforce: "pre",
      use: [{ loader: "@exact/webpack-plugin/loader", options: { target: "server" } }]
    });
  });

  it("applies conditions and loader rules to a compiler", () => {
    const compiler: WebpackCompilerLike = { options: {} };

    new ExactWebpackPlugin({ target: "server" }).apply(compiler);

    expect(compiler.options.resolve?.conditionNames).toEqual(["exact-server"]);
    expect(compiler.options.module?.rules).toHaveLength(1);
  });
});
