import { describe, expect, it } from "vitest";
import { rewriteModuleReferences } from "./module-rewrite.js";

const provider = {
  sourceModule: "@tanstack/react-query",
  sourceExport: "QueryClientProvider",
  targetModule: "@exact/tanstack-query/provider",
  targetExport: "ExactQueryClientProvider"
};

describe("expressions module reference rewriting", () => {
  it("splits named imports while retaining unmapped and type-only bindings", () => {
    const result = rewriteModuleReferences(
      'import { QueryClientProvider as Provider, useQuery, type QueryKey } from "@tanstack/react-query";\nexport const value = Provider;',
      { filename: "fixture.ts", replacements: [provider], sourceMap: true }
    );
    expect(result.code).toContain('import { useQuery, type QueryKey } from "@tanstack/react-query";');
    expect(result.code).toContain('import { ExactQueryClientProvider as Provider } from "@exact/tanstack-query/provider";');
    expect(result.map).toMatchObject({ version: 3, sources: ["fixture.ts"] });
  });

  it("rewrites re-exports, direct CommonJS properties, dynamic imports, and core aliases", () => {
    const result = rewriteModuleReferences(`
      export { QueryClientProvider as Provider, useQuery } from "@tanstack/react-query";
      const Provider2 = require("@tanstack/react-query").QueryClientProvider;
      const React = require("react");
      const runtime = import("react/jsx-runtime");
    `, { replacements: [provider], moduleAliases: {
      react: "@exact/react-compat/react19",
      "react/jsx-runtime": "@exact/react-compat/jsx-runtime19"
    } });
    expect(result.code).toContain('export { useQuery } from "@tanstack/react-query";');
    expect(result.code).toContain('export { ExactQueryClientProvider as Provider } from "@exact/tanstack-query/provider";');
    expect(result.code).toContain('require("@exact/tanstack-query/provider").ExactQueryClientProvider');
    expect(result.code).toContain('require("@exact/react-compat/react19")');
    expect(result.code).toContain('import("@exact/react-compat/jsx-runtime19")');
  });

  it("rewrites namespace uses by binding identity without touching shadowed names", () => {
    const result = rewriteModuleReferences('import * as Query from "@tanstack/react-query"; Query.QueryClientProvider;', {
      replacements: [provider, {
        sourceModule: "@exact/tanstack-query/provider",
        sourceExport: "ExactQueryClientProvider",
        targetModule: "@example/should-not-run",
        targetExport: "Other"
      }]
    });
    expect(result.changed).toBe(true);
    expect(result.code).toContain('ExactQueryClientProvider as __exact_ExactQueryClientProvider');
    expect(result.code).not.toContain('Query.QueryClientProvider;');
    expect(result.code).not.toContain('@example/should-not-run');
    const shadowed = rewriteModuleReferences('import * as Query from "@tanstack/react-query"; function f(Query: any) { return Query.QueryClientProvider; }', { replacements: [provider] });
    expect(shadowed.code).toContain('return Query.QueryClientProvider;');
  });

  it("splits CommonJS destructuring without retaining fully substituted source modules", () => {
    const result = rewriteModuleReferences('const { QueryClientProvider: Provider, useQuery } = require("@tanstack/react-query");', { replacements: [provider] });
    expect(result.code).toContain('const { useQuery } = require("@tanstack/react-query"), { ExactQueryClientProvider: Provider } = require("@exact/tanstack-query/provider");');
  });
});
