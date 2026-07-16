import { describe, expect, it } from "vitest";
import type { ExactPreparedCompilerRegistry } from "@exact/plugin-api";
import { analyzeSource } from "./index.js";

describe("compiler plugins", () => {
  it("rejects unknown namespaced directives without a prepared registry", () => {
    expect(() => analyzeSource(`
      /** @exact secrets.source */
      export const apiKey = "hidden";
    `, { filename: "config.ts" })).toThrow("unknown @exact directive namespace 'secrets'");
  });

  it("analyzes plain TypeScript and emits namespaced manifest data", () => {
    const registry: ExactPreparedCompilerRegistry = {
      fingerprint: "registry-one",
      plugins: {
        "@exact/secrets": {
          packageName: "@exact/secrets",
          version: "1.0.0",
          protocolVersion: "1.0.0",
          required: true,
          cacheKey: { policy: 1 },
          extension: {
            namespace: "secrets",
            directives: ["source", "sink"],
            analyzeModule(view) {
              return {
                diagnostics: view.directives.map(() => ({
                  severity: "info",
                  code: "source",
                  message: "secret source registered"
                })),
                manifestData: {
                  sources: view.directives.filter(value => value.name === "source").length
                }
              };
            }
          }
        }
      }
    };
    const manifest = analyzeSource(`
      /** @exact secrets.source */
      export const apiKey = "hidden";
    `, { filename: "config.ts", pluginRegistry: registry });
    expect(manifest.pluginRegistry?.fingerprint).toBe("registry-one");
    expect(manifest.pluginData?.["@exact/secrets"]).toEqual({ sources: 1 });
    expect(manifest.diagnostics).toContain("info: [@exact/secrets/source] secret source registered");
  });

  it("rejects imported manifests prepared by another registry", () => {
    const first = registry("one");
    const second = registry("two");
    const imported = analyzeSource("export const value = 1;", {
      filename: "dependency.ts",
      pluginRegistry: first
    });
    expect(() => analyzeSource("export const next = 2;", {
      filename: "consumer.ts",
      importedManifests: [imported],
      pluginRegistry: second
    })).toThrow("requires plugin registry");
  });
});

function registry(fingerprint: string): ExactPreparedCompilerRegistry {
  return {
    fingerprint,
    plugins: {
      "@exact/test": {
        packageName: "@exact/test",
        version: "1.0.0",
        protocolVersion: "1.0.0",
        required: true,
        cacheKey: fingerprint
      }
    }
  };
}
