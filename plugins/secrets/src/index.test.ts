import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import { createVNode } from "@exact/core";
import { renderHydrationScript, renderToString } from "@exact/ssr";
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

  it("reveals intentionally delivered secrets without tainting ordinary results", () => {
    const key = secret("API_KEY", "credential");
    const client = withSecret(key, apiKey => ({ apiKey, get: () => ({ ok: true }) }));
    expect(client.get()).toEqual({ ok: true });
    expect(deriveSecret("AUTH", key, value => `Bearer ${value}`).name).toBe("AUTH");
  });

  it("records call-argument application-owned secret consumption", () => {
    const manifest = analyzeSource(`
      declare const secrets: { require(name: string): string };
      /** @exact keep=secret */
      const apiKey = secrets.require("STRIPE_SECRET_KEY");
      function createClient(value: string) { return { ok: true }; }
      export const client = createClient(/** @exact consume=secret */ apiKey);
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server"
    });
    expect(manifest.policy.secretConsumers).toEqual([
      expect.objectContaining({
        selector: "STRIPE_SECRET_KEY",
        authorization: "implicit-application-owner",
        consumer: expect.objectContaining({ package: "@acme/app", symbol: "createClient", parameter: 0 })
      })
    ]);
  });

  it("requires caller-side consumption and a package permission for dependencies", () => {
    const source = `
      import { createClient } from "@acme/payments";
      declare const secrets: { require(name: string): string };
      /** @exact keep=secret */
      const apiKey = secrets.require("STRIPE_SECRET_KEY");
      export const client = createClient(/** @exact consume=secret */ apiKey);
    `;
    const manifest = analyzeSource(`
      ${source}
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server",
      capabilityPolicy: {
        secrets: {
          allowPackages: ["@acme/payments"]
        }
      }
    });
    expect(manifest.policy.secretConsumers[0]?.authorization).toBe("explicit-package-allow");
    expect(manifest.diagnostics.some(value => value.includes("allowPackages"))).toBe(false);

    const denied = analyzeSource(source.replace("/** @exact consume=secret */ ", ""), {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server"
    });
    expect(denied.diagnostics.some(value => value.includes("missing caller-side"))).toBe(true);
  });

  it("uses the package allowlist from prepared secrets plugin configuration", () => {
    const manifest = analyzeSource(`
      import { createClient } from "@acme/payments";
      /** @exact keep=secret */
      declare const apiKey: string;
      export const client = createClient(/** @exact consume=secret */ apiKey);
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server",
      pluginRegistry: {
        fingerprint: "secrets-config",
        plugins: {
          "@exact/secrets": {
            packageName: "@exact/secrets",
            version: "1.0.0",
            protocolVersion: "1.0.0",
            required: true,
            cacheKey: {
              policyVersion: 3,
              allowPackages: ["@acme/payments"]
            }
          }
        }
      }
    });

    expect(manifest.policy.secretConsumers[0]?.authorization).toBe("explicit-package-allow");
  });

  it("does not treat package permission as selector or provenance policy", () => {
    const manifest = analyzeSource(`
      import { createClient as buildClient } from "@acme/payments";
      /** @exact keep=secret */
      declare const apiKey: string;
      export const client = buildClient(/** @exact consume=secret */ apiKey);
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server",
      capabilityPolicy: {
        secrets: {
          allowPackages: ["@acme/payments"]
        }
      }
    });
    expect(manifest.policy.secretConsumers[0]?.authorization).toBe("explicit-package-allow");
    expect(manifest.policy.secretConsumers[0]?.selector).toBeUndefined();
  });

  it("checks the package directly receiving the secret without claiming transitive analysis", () => {
    const dependency = analyzeSource(`
      import { charge } from "@untrusted/gateway";
      export function createClient(value: string) {
        return charge(value);
      }
    `, {
      filename: "payments.ts",
      packageType: "library",
      packageName: "@acme/payments",
      target: "server"
    });
    const manifest = analyzeSource(`
      import { createClient as buildClient } from "@acme/payments";
      /** @exact keep=secret */
      declare const apiKey: string;
      export const client = buildClient(/** @exact consume=secret */ apiKey);
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server",
      importedManifests: [dependency],
      capabilityPolicy: {
        secrets: {
          allowPackages: ["@acme/payments"]
        }
      }
    });
    expect(manifest.policy.secretConsumers).toEqual([
      expect.objectContaining({
        authorization: "explicit-package-allow",
        consumer: expect.objectContaining({ package: "@acme/payments", symbol: "createClient" })
      })
    ]);
  });

  it("tracks local secret forwarding by binding identity instead of shadowed names", () => {
    const manifest = analyzeSource(`
      import { send } from "@untrusted/gateway";
      /** @exact keep=secret */
      declare const apiKey: string;

      function useLocally() {
        function forward(value: string) {
          return value;
        }
        return forward(/** @exact consume=secret */ apiKey);
      }

      function forward(value: string) {
        return send(value);
      }

      export const result = useLocally();
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server"
    });

    expect(manifest.policy.secretConsumers).toEqual([
      expect.objectContaining({
        authorization: "implicit-application-owner",
        consumer: expect.objectContaining({
          package: "@acme/app",
          symbol: "forward",
          parameter: 0
        })
      })
    ]);
    expect(manifest.policy.secretConsumers.some(
      consumer => consumer.consumer.package === "@untrusted/gateway"
    )).toBe(false);
  });

  it("carries caller-owned consumption through ordinary application helper parameters", () => {
    const manifest = analyzeSource(`
      import { send } from "@acme/gateway";
      /** @exact keep=secret */
      declare const apiKey: string;

      function createClient(value: string) {
        return send(value);
      }

      export const client = createClient(/** @exact consume=secret */ apiKey);
    `, {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server",
      capabilityPolicy: {
        secrets: {
          allowPackages: ["@acme/gateway"]
        }
      }
    });

    expect(manifest.policy.secretConsumers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        authorization: "implicit-application-owner",
        consumer: expect.objectContaining({ package: "@acme/app", symbol: "createClient" })
      }),
      expect.objectContaining({
        authorization: "explicit-package-allow",
        consumer: expect.objectContaining({ package: "@acme/gateway", symbol: "send" })
      })
    ]));
    expect(manifest.diagnostics).not.toEqual(expect.arrayContaining([
      expect.stringContaining("missing caller-side")
    ]));
  });

  it("rejects secret consumers retained in client compilation", () => {
    const manifest = analyzeSource(`
      declare const secrets: { require(name: string): string };
      /** @exact keep=secret */
      const apiKey = secrets.require("API_KEY");
      function connect(value: string) {}
      connect(/** @exact consume=secret */ apiKey);
    `, {
      filename: "client.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "client"
    });
    expect(manifest.diagnostics.some(value => value.includes("client artifact"))).toBe(true);
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
      required: ["DATABASE_URL"],
      allowPackages: []
    }, {
      applicationRoot: "/app",
      environment: "test",
      signal: new AbortController().signal
    });
    await expect(createSecretsServerExtension(resolver).validate?.())
      .rejects.toThrow("Required secret DATABASE_URL is not configured");
  });

  it("provides application code with a direct secret resolver", async () => {
    const resolver = createSecretResolver({
      providers: [{
        name: "fixture",
        async load() { return { API_KEY: secret("API_KEY", "credential") }; }
      }],
      required: [],
      allowPackages: ["@acme/payments"]
    }, {
      applicationRoot: "/app",
      environment: "test",
      signal: new AbortController().signal
    });
    await resolver.initialize();
    expect(resolver.require("API_KEY").name).toBe("API_KEY");
    expect(resolver.optional("MISSING")).toBeUndefined();
  });
});
