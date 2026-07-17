import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import { createVNode } from "@exact/core";
import { renderHydrationScript, renderToString } from "@exact/ssr";
import type { ExactPreparedCompilerRegistry } from "@exact/plugin-api";
import { createSecretCompilerExtension } from "./compiler.js";
import { deriveSecret, secret, secretPath, withSecret } from "./index.js";
import { parseEnvironmentFile } from "./providers.js";
import createSecretsRenderExtension from "./render.js";
import createSecretsServerExtension, { createSecretResolver } from "./server.js";

describe("@exact/secrets", () => {
  it("keeps secret wrappers out of JSON and ordinary primitive conversion", () => {
    const value = secret("API_KEY", "credential");
    expect(() => JSON.stringify({ value })).toThrow("cannot be serialized");
    expect(() => `${value}`).toThrow("cannot be converted");
    expect(secretPath({ nested: [value] })).toBe("$.nested[0]");
  });

  it("allows a server sink to consume a secret without tainting its result", () => {
    const key = secret("API_KEY", "credential");
    const client = withSecret(key, apiKey => ({ apiKey, get: () => ({ ok: true }) }));
    expect(client.get()).toEqual({ ok: true });
    expect(deriveSecret("AUTH", key, value => `Bearer ${value}`).name).toBe("AUTH");
  });

  it("propagates compiler secrecy through derivatives and rejects VNode emission", () => {
    const manifest = analyzeSource(`
      /** @exact secrets.source */
      const apiKey = process.env.API_KEY;
      const header = "Bearer " + apiKey;
      export function View() { return <div>{header}</div>; }
    `, {
      filename: "view.tsx",
      pluginRegistry: registry(),
      target: "server"
    });
    expect(manifest.diagnostics).toContain(
      "error: [@exact/secrets/vnode-secret] Secret-derived values cannot be emitted in a VNode"
    );
  });

  it("does not taint an authenticated client's ordinary request results", () => {
    const manifest = analyzeSource(`
      /** @exact secrets.source */
      const apiKey = process.env.API_KEY;
      /** @exact secrets.sink */
      const client = createHttpClient({ apiKey });
      const result = await client.get("/profile");
      export function View() { return <div>{result.name}</div>; }
    `, {
      filename: "view.tsx",
      pluginRegistry: registry(),
      target: "server"
    });
    expect(manifest.diagnostics.filter(value => value.includes("@exact/secrets/"))).toEqual([]);
  });

  it("rejects secret-derived values in client compilation", () => {
    const manifest = analyzeSource(`
      /** @exact secrets.source */
      const apiKey = process.env.API_KEY;
      const header = "Bearer " + apiKey;
      console.log(header);
    `, {
      filename: "client.ts",
      pluginRegistry: registry(),
      target: "client"
    });
    expect(manifest.diagnostics.some(value => value.includes("client-secret"))).toBe(true);
  });

  it("parses environment providers without exposing values in errors", () => {
    expect(parseEnvironmentFile("API_KEY=credential\nQUOTED='value here'")).toEqual(new Map([
      ["API_KEY", "credential"],
      ["QUOTED", "value here"]
    ]));
    expect(() => parseEnvironmentFile("not valid")).toThrow("Malformed environment secret declaration");
  });

  it("blocks secret values from VNodes, HTML rendering, and hydration state", () => {
    const output = createSecretsRenderExtension().output!;
    const key = secret("API_KEY", "credential");
    expect(() => renderToString(createVNode("div", { title: key }), {
      outputExtensions: [output]
    })).toThrow("output validation failed");
    expect(() => renderHydrationScript({
      state: { key },
      outputExtensions: [output]
    })).toThrow("output validation failed");
  });

  it("fails server startup when a required secret is unavailable", async () => {
    const resolver = createSecretResolver({
      providers: [{
        name: "empty",
        async load() { return {}; }
      }],
      required: ["DATABASE_URL"]
    }, {
      applicationRoot: "/app",
      environment: "test",
      signal: new AbortController().signal
    });
    await expect(createSecretsServerExtension(resolver).validate?.())
      .rejects.toThrow("Required secret DATABASE_URL is not configured");
  });
});

function registry(): ExactPreparedCompilerRegistry {
  return {
    fingerprint: "secrets-registry",
    plugins: {
      "@exact/secrets": {
        packageName: "@exact/secrets",
        version: "1.0.0",
        protocolVersion: "1.0.0",
        required: true,
        cacheKey: { policyVersion: 1 },
        extension: createSecretCompilerExtension()
      }
    }
  };
}
