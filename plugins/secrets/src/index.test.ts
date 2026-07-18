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

  it("records and implicitly authorizes application-owned secret consumption", () => {
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

  it("requires a caller marker and an exact non-transitive dependency grant", () => {
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
          grants: [{ package: "@acme/payments", secrets: ["STRIPE_SECRET_KEY"] }]
        }
      }
    });
    expect(manifest.policy.secretConsumers[0]?.authorization).toBe("explicit-grant");
    expect(manifest.diagnostics.some(value => value.includes("without a secret grant"))).toBe(false);

    const denied = analyzeSource(source.replace("/** @exact consume=secret */", ""), {
      filename: "app.ts",
      packageType: "application",
      packageName: "@acme/app",
      target: "server"
    });
    expect(denied.diagnostics.some(value => value.includes("missing the caller-side"))).toBe(true);
  });

  it("enforces pinned dependency provenance at the compiler boundary", () => {
    const dependency = analyzeSource("export function createClient(value: string) { return value; }", {
      filename: "payments.ts",
      packageType: "library",
      packageName: "@acme/payments",
      packageVersion: "3.2.1",
      packageIntegrity: "sha512-correct"
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
          grants: [{
            package: "@acme/payments",
            secrets: ["*"],
            version: "3.2.1",
            integrity: "sha512-wrong"
          }]
        }
      }
    });
    expect(manifest.policy.secretConsumers[0]?.authorization).toBe("denied");
    expect(manifest.diagnostics.some(value => value.includes("integrity"))).toBe(true);
  });

  it("rejects dependency wrapper laundering through parametric callable summaries", () => {
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
          grants: [{ package: "@acme/payments", secrets: ["*"] }]
        }
      }
    });
    expect(manifest.policy.secretConsumers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        authorization: "denied",
        consumer: expect.objectContaining({ package: "@untrusted/gateway", symbol: "charge" })
      })
    ]));
    expect(manifest.diagnostics.some(value => value.includes("forwards a secret"))).toBe(true);
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
      grants: []
    }, {
      applicationRoot: "/app",
      environment: "test",
      signal: new AbortController().signal
    });
    await expect(createSecretsServerExtension(resolver).validate?.())
      .rejects.toThrow("Required secret DATABASE_URL is not configured");
  });

  it("scopes runtime access and emits redacted audit events", async () => {
    const events: Array<{ selector: string; authorization: string }> = [];
    const resolver = createSecretResolver({
      providers: [{
        name: "fixture",
        async load() { return { API_KEY: secret("API_KEY", "credential") }; }
      }],
      required: [],
      grants: [{ package: "@acme/payments", secrets: ["API_*"], version: "1.0.0" }],
      audit: {
        redactIdentifiers: true,
        onEvent(event) { events.push(event); }
      }
    }, {
      applicationRoot: "/app",
      environment: "test",
      signal: new AbortController().signal
    });
    await resolver.initialize();
    expect(resolver.scope({ package: "@acme/payments", version: "1.0.0" }).require("API_KEY").name).toBe("API_KEY");
    expect(() => resolver.scope({ package: "@other/package" }).require("API_KEY")).toThrow("not permitted");
    expect(events).toHaveLength(2);
    expect(events[0]!.selector).not.toContain("API_KEY");
    expect(events.map(event => event.authorization)).toEqual(["explicit-grant", "denied"]);
  });
});
