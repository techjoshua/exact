import { describe, expect, it } from "vitest";
import path from "node:path";
import { analyzeSource, parseExactCompilerManifest, transform } from "./index.js";

const fixture = (name: string) => path.join(process.cwd(), `${name}.policy-fixture.tsx`);

describe("generic data policy IR", () => {
  it("records explicit fields and inferred isomorphic island transfers", () => {
    const manifest = analyzeSource(`
      import type { Component } from "@exact/core";
      interface State {
        /** @exact keep=server */ internal: string;
        title: string;
      }
      export function Panel(this: Component<State>) {
        this.task.server(() => { this.state.title = "ready"; });
        return () => <button title={this.state.title} onClick={() => this.state.title = "next"} />;
      }
    `, { filename: fixture("manifest") });

    expect(manifest.version).toBe(1);
    expect(manifest.policy.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "state",
        path: "internal",
        policy: { residency: "server", secret: false },
        source: "annotation"
      }),
      expect.objectContaining({
        kind: "state",
        path: "title",
        policy: { residency: "isomorphic", secret: false },
        source: "inference"
      })
    ]));
    expect(manifest.policy.flows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "transfer",
        boundary: "client-island",
        authorized: true,
        policy: { residency: "isomorphic", secret: false }
      }),
      expect.objectContaining({
        kind: "projection",
        boundary: "state",
        authorized: true
      })
    ]));
  });

  it("rejects server-kept and secret state before island artifact emission", () => {
    expect(() => transform(`
      import type { Component } from "@exact/core";
      interface State {
        /** @exact keep=secret */ credential: string;
      }
      export function Panel(this: Component<State>) {
        return () => <button title={this.state.credential} onClick={() => this.state.credential = "next"} />;
      }
    `, { filename: fixture("protected-island"), target: "server", serverComponents: true })).toThrow(
      "client island captures secret state path credential"
    );
  });

  it("treats route loader and action results as hydration transfer sinks", () => {
    const manifest = analyzeSource(`
      import { consume, type Secret } from "@exact/secrets";
      /** @exact keep=server */ const internal = { tenant: "private" };
      /** @exact keep=secret */ const credential = "configured" as Secret<string>;
      const loader = () => internal;
      const safeLoader = () => consume(credential);
      export const routes = [
        { path: "direct", loader: () => internal },
        { path: "shorthand", loader },
        { path: "action", async action() { return credential; } },
        { path: "safe", loader: safeLoader }
      ];
    `, {
      filename: fixture("route-hydration-policy"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.diagnostics.filter(diagnostic => diagnostic.includes("route loader hydration data"))).toHaveLength(2);
    expect(manifest.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("server-kept value cannot enter route loader hydration data"),
      expect.stringContaining("secret value cannot enter route action hydration data")
    ]));
    expect(manifest.policy.flows).toEqual(expect.arrayContaining([
      expect.objectContaining({ boundary: "hydration", authorized: false })
    ]));
  });

  it("uses protected state reads as task placement effects", () => {
    const manifest = analyzeSource(`
      import type { Component } from "@exact/core";
      interface State {
        /** @exact keep=server */ internal: string;
      }
      export function Panel(this: Component<State>) {
        this.task(() => { void this.state.internal; });
        return () => <p>Ready</p>;
      }
    `, { filename: fixture("task-placement") });

    expect(manifest.components[0]?.tasks[0]?.placement).toBe("server");
  });

  it("rejects explicit client tasks that access server-kept contexts", () => {
    expect(() => transform(`
      import { createContext, type Component } from "@exact/core";
      export const AuthorizationContext = createContext<{ hasRole(role: string): boolean }>(
        "authorization",
        { global: true, keep: "server", scope: "request" }
      );
      export function Panel(this: Component<{}>) {
        this.task.client(() => { this.getContext(AuthorizationContext); });
        return () => <p>Ready</p>;
      }
    `, { filename: fixture("context-placement"), target: "client" })).toThrow(
      "client task reads or writes server-kept data"
    );
  });

  it("keeps inferred public context calls neutral and protected context calls server-only", () => {
    const manifest = analyzeSource(`
      import { createContext, type Component } from "@exact/core";
      const PublicContext = createContext<{ value(): string }>("public");
      const ServerContext = createContext<{ value(): string }>(
        "server",
        { global: true, reactive: false, keep: "server", scope: "request" }
      );
      export function PublicPanel(this: Component<{}>) {
        const context = this.getContext(PublicContext);
        return () => <p>{context.value()}</p>;
      }
      export function ServerPanel(this: Component<{}>) {
        const context = this.getContext(ServerContext);
        return () => <p>{context.value()}</p>;
      }
    `, { filename: fixture("context-call-effects") });

    expect(manifest.components.find(component => component.name === "PublicPanel")?.placement)
      .toBe("isomorphic");
    expect(manifest.components.find(component => component.name === "ServerPanel")?.placement)
      .toBe("server");
  });

  it("propagates secret qualification through declaration aliases", () => {
    const manifest = analyzeSource(`
      /** @exact keep=secret */ const apiKey = "configured";
      const authorization = \`Bearer \${apiKey}\`;
      export { authorization };
    `, { filename: fixture("propagation") });

    expect(manifest.policy.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "apiKey",
        policy: { residency: "server", secret: true },
        source: "annotation"
      }),
      expect.objectContaining({
        name: "authorization",
        policy: { residency: "server", secret: true },
        source: "inference"
      })
    ]));
    expect(manifest.policy.flows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "propagation",
        policy: { residency: "server", secret: true },
        authorized: true
      })
    ]));
  });

  it("carries inferred return policy through local calls", () => {
    const manifest = analyzeSource(`
      /** @exact keep=secret */ const apiKey = "configured";
      function authorizationHeader() {
        return \`Bearer \${apiKey}\`;
      }
      const header = authorizationHeader();
      export { header };
    `, { filename: fixture("return-propagation") });

    expect(manifest.policy.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "return",
        name: "authorizationHeader",
        policy: { residency: "server", secret: true },
        source: "inference"
      }),
      expect.objectContaining({
        kind: "declaration",
        name: "header",
        policy: { residency: "server", secret: true },
        source: "inference"
      })
    ]));
  });

  it("recognizes transparent secret API values through their type policy", () => {
    const manifest = analyzeSource(`
      import { secret } from "@exact/secrets";
      const apiKey = secret("API_KEY", "configured");
      const authorization = \`Bearer \${apiKey}\`;
      export { authorization };
    `, { filename: fixture("secret-type") });

    expect(manifest.policy.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "apiKey",
        policy: { residency: "server", secret: true }
      }),
      expect.objectContaining({
        name: "authorization",
        policy: { residency: "server", secret: true }
      })
    ]));
    const subjectIds = new Set(manifest.policy.subjects.map(subject => subject.id));
    expect(manifest.policy.flows.every(flow =>
      subjectIds.has(flow.to) && flow.from.every(id => subjectIds.has(id))
    )).toBe(true);
  });

  it("audits consume() itself and rejects a secret passed to an ordinary parameter", () => {
    const manifest = analyzeSource(`
      import { consume } from "@exact/secrets";
      /** @exact keep=secret */ const apiKey = "configured";
      function createStripeClient(value: string) {}
      function createSomeOtherClient(value: string) {}
      createStripeClient(consume(apiKey));
      createSomeOtherClient(apiKey);
      export {};
    `, {
      filename: fixture("call-site-consumption"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.policy.secretConsumers).toEqual([
      expect.objectContaining({
        authorization: "implicit-application-owner",
        consumer: expect.objectContaining({ symbol: "consume" })
      })
    ]);
    expect(manifest.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("secret argument requires an explicit Secret<T> parameter or consume()")
    ]));
  });

  it("stops tracking the result of a standalone consume() call", () => {
    const manifest = analyzeSource(`
      import { consume } from "@exact/secrets";
      /** @exact keep=secret */ const configuredApiKey = "configured";
      const apiKey = consume(configuredApiKey);
      function createStripeClient(value: string) {}
      function createSomeOtherClient(value: string) {}
      createStripeClient(apiKey);
      createSomeOtherClient(apiKey);
      export {};
    `, {
      filename: fixture("declaration-consumption"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.policy.secretConsumers).toEqual([
      expect.objectContaining({
        authorization: "implicit-application-owner",
        consumer: expect.objectContaining({ symbol: "consume" })
      })
    ]);
    expect(manifest.policy.subjects.some(subject => subject.name === "apiKey")).toBe(false);
  });

  it("rejects consume() on a non-secret argument", () => {
    const manifest = analyzeSource(`
      import { consume } from "@exact/secrets";
      const publicValue = "public";
      consume(publicValue);
      export {};
    `, { filename: fixture("invalid-call-site-consumption") });

    expect(manifest.diagnostics).toContain(
      "error: consume() argument is not secret-qualified"
    );
  });

  it("propagates secret qualification through method calls and destructuring until consume()", () => {
    const manifest = analyzeSource(`
      import { consume, type Secret } from "@exact/secrets";
      declare const secrets: { require(name: string): Secret<string> };
      const combo = secrets.require("ClientKeyAndSecret");
      const [key, clientSecret] = combo.split(":");
      const authorization = \`JWT-Bearer - \${key}:\${clientSecret}\`;
      const rawAuthorization = consume(authorization);
      export { key, clientSecret, authorization, rawAuthorization };
    `, {
      filename: fixture("derived-secret"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.policy.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "combo", policy: { residency: "server", secret: true } }),
      expect.objectContaining({ name: "key", policy: { residency: "server", secret: true } }),
      expect.objectContaining({ name: "clientSecret", policy: { residency: "server", secret: true } }),
      expect.objectContaining({ name: "authorization", policy: { residency: "server", secret: true } })
    ]));
    expect(manifest.policy.subjects.some(subject => subject.name === "rawAuthorization")).toBe(false);
  });

  it("preserves compiler-derived qualification in emitted TypeScript", () => {
    const output = transform(`
      import { secret, type Secret } from "@exact/secrets";
      const apiKey = secret("API_KEY", "configured");
      const header = \`Bearer \${apiKey}\`;
      function forward(value: Secret<string>): Secret<string> {
        return value;
      }
      export function derive(value: Secret<string>) {
        return \`Derived \${value}\`;
      }
      export const result = forward(header);
      export const direct = forward(\`Direct \${apiKey}\`);
    `, {
      filename: fixture("secret-type-preservation"),
      packageType: "application",
      target: "server",
      generatedValidation: "semantic"
    });

    expect(output).toContain('import type { Secret as __ExactSecret } from "@exact/secrets";');
    expect(output).toMatch(/const header = `Bearer \$\{apiKey\}` as __ExactSecret<string>;/);
    expect(output).toMatch(/return `Derived \$\{value\}` as __ExactSecret<string>;/);
    expect(output).toMatch(/forward\(`Direct \$\{apiKey\}` as __ExactSecret<string>\)/);
  });

  it("allows an unconsumed secret only through an explicit Secret<T> parameter", () => {
    const manifest = analyzeSource(`
      import { secret, type Secret } from "@exact/secrets";
      const apiKey = secret("API_KEY", "configured");
      function preserve(value: Secret<string>) { return value; }
      function ordinary(value: string) { return value; }
      preserve(apiKey);
      ordinary(apiKey);
      export {};
    `, {
      filename: fixture("explicit-secret-parameter"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.policy.flows).toEqual(expect.arrayContaining([
      expect.objectContaining({ boundary: "call", authorized: true }),
      expect.objectContaining({
        boundary: "call",
        authorized: false,
        reason: "secret argument requires an explicit Secret<T> parameter or consume()"
      })
    ]));
    expect(manifest.policy.secretConsumers).toEqual([]);
  });

  it("rejects unconsumed secrets in VNode children, attributes, and spreads", () => {
    const manifest = analyzeSource(`
      import type { Component } from "@exact/core";
      /** @exact keep=secret */ const credential = "configured";
      export function Panel(this: Component<{}>) {
        const attributes = { title: credential };
        return () => <div {...attributes} data-secret={credential}>{credential}</div>;
      }
    `, {
      filename: fixture("secret-vnode-sinks"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("secret-qualified value cannot influence VNode output"),
      expect.stringContaining("secret-qualified value cannot influence a VNode attribute"),
      expect.stringContaining("secret-qualified value cannot influence a VNode spread attribute")
    ]));
    expect(manifest.policy.flows).toEqual(expect.arrayContaining([
      expect.objectContaining({ boundary: "vnode", authorized: false })
    ]));
  });

  it("allows consume() to end tracking before deliberate server VNode output", () => {
    const manifest = analyzeSource(`
      import { consume } from "@exact/secrets";
      import type { Component } from "@exact/core";
      /** @exact keep=secret */ const credential = "configured";
      export function Panel(this: Component<{}>) {
        return () => <div>{consume(credential)}</div>;
      }
    `, {
      filename: fixture("consumed-vnode-sink"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.diagnostics.some(diagnostic => diagnostic.includes("VNode"))).toBe(false);
    expect(manifest.policy.secretConsumers).toEqual([
      expect.objectContaining({
        authorization: "implicit-application-owner",
        consumer: expect.objectContaining({ symbol: "consume" })
      })
    ]);
  });

  it("rejects direct and implicit secret influence on errors and console output", () => {
    const manifest = analyzeSource(`
      /** @exact keep=secret */ const credential = "configured";
      export function validate(candidate: string) {
        if (credential === candidate) {
          console.info("matched");
          throw new Error("matched");
        }
        throw credential;
      }
    `, {
      filename: fixture("secret-error-log-sinks"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("secret-qualified value cannot influence secret-controlled console output"),
      expect.stringContaining("secret-qualified value cannot influence secret-controlled error behavior"),
      expect.stringContaining("secret-qualified value cannot influence a thrown error")
    ]));
    expect(manifest.policy.flows).toEqual(expect.arrayContaining([
      expect.objectContaining({ boundary: "log", authorized: false }),
      expect.objectContaining({ boundary: "error", authorized: false })
    ]));
  });

  it("propagates secret control dependencies through branch writes into VNode sinks", () => {
    const manifest = analyzeSource(`
      import type { Component } from "@exact/core";
      /** @exact keep=secret */ const credential = "configured";
      export function Panel(this: Component<{}>) {
        let label = "not matched";
        if (credential === "expected") {
          label = "matched";
        }
        return () => <div>{label}</div>;
      }
    `, {
      filename: fixture("secret-control-write"),
      packageType: "application",
      target: "server"
    });

    expect(manifest.policy.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "label",
        policy: { residency: "server", secret: true },
        source: "inference"
      })
    ]));
    expect(manifest.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("secret-qualified value cannot influence VNode output")
    ]));
  });

  it("omits server-kept exported declarations from client artifacts", () => {
    const source = `
      /** @exact keep=server */ export const internalConfiguration = { region: "west" };
      export const publicConfiguration = { name: "Example" };
    `;
    const client = transform(source, {
      filename: fixture("export-placement"),
      target: "client",
      serverComponents: true
    });
    const manifest = analyzeSource(source, { filename: fixture("export-placement-manifest") });

    expect(client).not.toContain("internalConfiguration");
    expect(client).toContain("publicConfiguration");
    expect(manifest.exports).toContainEqual({
      name: "internalConfiguration",
      kind: "value",
      placement: "server"
    });
  });

  it("validates the policy envelope when loading manifests", () => {
    const manifest = analyzeSource(`export const value = 1;`, { filename: fixture("validation") });
    expect(parseExactCompilerManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    expect(() => parseExactCompilerManifest({
      ...manifest,
      policy: {
        ...manifest.policy,
        subjects: [{
          id: "broken",
          kind: "state",
          name: "broken",
          policy: { residency: "client", secret: true },
          source: "annotation"
        }]
      }
    })).toThrow("Malformed eXact compiler manifest");
    expect(() => parseExactCompilerManifest({
      ...manifest,
      policy: {
        ...manifest.policy,
        flows: [{
          id: "dangling",
          kind: "propagation",
          from: ["missing"],
          to: "missing",
          policy: { residency: "isomorphic", secret: false },
          authorized: true
        }]
      }
    })).toThrow("policy graph");
  });
});
