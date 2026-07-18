import { describe, expect, it } from "vitest";
import { discoverReactCompatAdapters, replacementKey, replacementsForImporter, type ReactCompatPackageGraph, type ReactCompatPackageNode } from "./adapters.js";

function node(id: string, manifest: ReactCompatPackageNode["manifest"], dependencies: string[] = []): ReactCompatPackageNode {
  return { id, location: `/fixture/${id || "root"}`, manifest, dependencies };
}

function adapter(name: string, sourceVersion = ">=5 <6", replacementExport = "QueryClientProvider"): ReactCompatPackageNode["manifest"] {
  return {
    name,
    version: "1.0.0",
    dependencies: { "@exact/react-compat-adapter-api": "^1.0.0" },
    exports: { ".": "./dist/index.js", "./provider": "./dist/provider.js" },
    exact: { reactCompatibility: { schemaVersion: 1, substitutions: {
      "@tanstack/react-query": { variants: [{ version: sourceVersion, exports: {
        QueryClientProvider: { subpath: "./provider", export: replacementExport }
      } }] }
    } } }
  };
}

function graph(nodes: ReactCompatPackageNode[]): ReactCompatPackageGraph {
  return { rootId: "root", nodes: new Map(nodes.map(value => [value.id, value])) };
}

describe("React compatibility adapter discovery", () => {
  it("finds adapters below the application dependency layer", () => {
    const registry = discoverReactCompatAdapters(graph([
      node("root", { name: "app", version: "1.0.0" }, ["framework"]),
      node("framework", { name: "@org/framework", version: "1.0.0" }, ["adapter", "query"]),
      node("adapter", adapter("@example/exact-query"), ["marker"]),
      node("marker", { name: "@exact/react-compat-adapter-api", version: "1.0.0", exports: { ".": "./index.js" } }),
      node("query", { name: "@tanstack/react-query", version: "5.80.0" })
    ]));
    expect(registry.adapters).toEqual(["@example/exact-query"]);
    expect(registry.replacements.get(replacementKey("query", "@tanstack/react-query", "QueryClientProvider")))
      .toMatchObject({ adapterPackage: "@example/exact-query", specifier: "@example/exact-query/provider" });
  });

  it("rejects incompatible duplicate adapter and protocol versions", () => {
    expect(() => discoverReactCompatAdapters(graph([
      node("root", { name: "app", version: "1.0.0" }, ["one", "two"]),
      node("one", adapter("@example/query")),
      node("two", { ...adapter("@example/query"), version: "2.0.0" })
    ]))).toThrow(/incompatible versions.*1\.0\.0, 2\.0\.0/);
    const incompatible = { ...adapter("@example/protocol"), dependencies: { "@exact/react-compat-adapter-api": "^2.0.0" } };
    expect(() => discoverReactCompatAdapters(graph([
      node("root", { name: "app", version: "1.0.0" }, ["adapter"]), node("adapter", incompatible)
    ]))).toThrow(/protocol.*incompatible|incompatible.*adapter-api/i);
  });

  it("applies root ignores before conflict and version checks", () => {
    const registry = discoverReactCompatAdapters(graph([
      node("root", { name: "app", version: "1.0.0", exact: { reactCompatibility: { ignoreAdapters: ["@example/bad"] } } }, ["good", "bad", "query"]),
      node("good", adapter("@example/good")),
      node("bad", adapter("@example/bad", ">=4 <5")),
      node("query", { name: "@tanstack/react-query", version: "5.80.0" })
    ]));
    expect(registry.adapters).toEqual(["@example/good"]);
  });

  it("leaves unsupported versions unmapped and rejects conflicts, missing direct markers, and private subpaths", () => {
    const base = [node("root", { name: "app", version: "1.0.0" }, ["adapter", "query"]), node("query", { name: "@tanstack/react-query", version: "5.80.0" })];
    expect(discoverReactCompatAdapters(graph([...base, node("adapter", adapter("@example/old", ">=4 <5"))])).replacements.size)
      .toBe(0);
    expect(() => discoverReactCompatAdapters(graph([
      node("root", { name: "app", version: "1.0.0" }, ["one", "two", "query"]),
      node("one", adapter("@example/one")), node("two", adapter("@example/two")),
      node("query", { name: "@tanstack/react-query", version: "5.80.0" })
    ]))).toThrow(/replacement conflict/);
    const noMarker = { ...adapter("@example/unmarked"), dependencies: {} };
    expect(() => discoverReactCompatAdapters(graph([...base, node("adapter", noMarker)]))).toThrow(/directly depend/);
    const privateExport = { ...adapter("@example/private"), exports: { ".": "./dist/index.js" } };
    expect(() => discoverReactCompatAdapters(graph([...base, node("adapter", privateExport)]))).toThrow(/not a public package export/);
  });

  it("selects variants independently for duplicate installed majors", () => {
    const manifest = adapter("@example/exact-query") as any;
    manifest.exact.reactCompatibility.substitutions["@tanstack/react-query"].variants.push({
      version: ">=4 <5",
      exports: { QueryClientProvider: { subpath: "./provider", export: "LegacyProvider" } }
    });
    const fixture = graph([
      node("root", { name: "app", version: "1.0.0" }, ["adapter", "modern", "nested"]),
      node("adapter", manifest, ["marker"]),
      node("marker", { name: "@exact/react-compat-adapter-api", version: "1.0.0" }),
      node("modern", { name: "@tanstack/react-query", version: "5.80.0" }),
      node("nested", { name: "@org/nested", version: "1.0.0" }, ["legacy"]),
      node("legacy", { name: "@tanstack/react-query", version: "4.40.0" })
    ]);
    const registry = discoverReactCompatAdapters(fixture);
    expect(replacementsForImporter(fixture, registry, "/fixture/root/app.ts")[0]?.export).toBe("QueryClientProvider");
    expect(replacementsForImporter(fixture, registry, "/fixture/nested/view.ts")[0]?.export).toBe("LegacyProvider");
  });

  it("rejects overlapping variants", () => {
    const manifest = adapter("@example/overlap") as any;
    manifest.exact.reactCompatibility.substitutions["@tanstack/react-query"].variants.push({
      version: ">=5.5 <7",
      exports: { QueryClientProvider: { subpath: "./provider", export: "OtherProvider" } }
    });
    expect(() => discoverReactCompatAdapters(graph([
      node("root", { name: "app", version: "1.0.0" }, ["adapter", "query"]),
      node("adapter", manifest),
      node("query", { name: "@tanstack/react-query", version: "5.80.0" })
    ]))).toThrow(/overlapping source ranges/);
  });
});
