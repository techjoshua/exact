import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  exact,
  mergeConditions,
  resolveExactBunRequest,
  transformExactBunSource,
  type BunBuildLike
} from "./index.js";

describe("@exact/bun-plugin", () => {
  it("transforms matching TSX sources through the shared compiler", () => {
    const result = transformExactBunSource("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
  });

  it("resolves exact facade imports through shared artifact resolution", () => {
    expect(resolveExactBunRequest("./Panel.exact", "/app/src/main.ts", { target: "server" })).toBe(path.resolve("/app/src/Panel.exact.server.ts"));
    expect(resolveExactBunRequest("./Panel", "/app/src/main.ts")).toBeNull();
  });

  it("merges conditions without duplicating existing entries", () => {
    expect(mergeConditions(["browser", "exact-client"], ["exact-client"])).toEqual(["exact-client", "browser"]);
  });

  it("registers Bun resolve and load hooks", () => {
    const resolveHooks: unknown[] = [];
    const loadHooks: unknown[] = [];
    const build: BunBuildLike = {
      config: { conditions: ["browser"] },
      onResolve(options, handler) {
        resolveHooks.push({ options, handler });
      },
      onLoad(options, handler) {
        loadHooks.push({ options, handler });
      }
    };

    exact({ target: "server" }).setup(build);

    expect(build.config?.conditions).toEqual(["exact-server", "browser"]);
    expect(resolveHooks).toHaveLength(1);
    expect(loadHooks).toHaveLength(1);
  });
});
