import { describe, expect, it } from "vitest";
import {
  packageDirectlyDependsOnAdapterMarker,
  readReactCompatAdapterDeclaration,
  readReactCompatApplicationPolicy
} from "./index.js";

const validManifest = {
  name: "@example/exact-query",
  dependencies: { "@exact/react-compat-adapter-api": "^0.0.0" },
  exact: {
    reactCompatibility: {
      schemaVersion: 1,
      substitutions: {
        "@tanstack/react-query": {
          version: ">=5 <6",
          exports: {
            QueryClientProvider: { subpath: "./provider", export: "QueryClientProvider" }
          }
        }
      }
    }
  }
};

describe("React compatibility adapter protocol", () => {
  it("parses inert owned-export metadata", () => {
    expect(readReactCompatAdapterDeclaration(validManifest)?.substitutions["@tanstack/react-query"]?.exports.QueryClientProvider)
      .toEqual({ subpath: "./provider", export: "QueryClientProvider" });
    expect(packageDirectlyDependsOnAdapterMarker(validManifest)).toBe(true);
  });

  it("rejects reserved sources, arbitrary target fields, and dependency suppression", () => {
    const mutate = () => structuredClone(validManifest) as any;
    const reserved = mutate();
    reserved.exact.reactCompatibility.substitutions.react = reserved.exact.reactCompatibility.substitutions["@tanstack/react-query"];
    delete reserved.exact.reactCompatibility.substitutions["@tanstack/react-query"];
    expect(() => readReactCompatAdapterDeclaration(reserved)).toThrow(/reserved framework package react/);
    const target = mutate();
    target.exact.reactCompatibility.substitutions["@tanstack/react-query"].exports.QueryClientProvider.package = "elsewhere";
    expect(() => readReactCompatAdapterDeclaration(target)).toThrow(/unsupported field/);
    const ignored = mutate();
    ignored.exact.reactCompatibility.ignoreAdapters = ["@example/other"];
    expect(() => readReactCompatAdapterDeclaration(ignored)).toThrow(/only the application root/);
  });

  it("parses and validates root ignore policy", () => {
    expect(readReactCompatApplicationPolicy({ exact: { reactCompatibility: { ignoreAdapters: ["@example/one"] } } }))
      .toEqual({ ignoreAdapters: ["@example/one"] });
    expect(() => readReactCompatApplicationPolicy({ exact: { reactCompatibility: { ignoreAdapters: ["../one"] } } }))
      .toThrow(/bare package name/);
  });
});
