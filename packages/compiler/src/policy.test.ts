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

    expect(manifest.version).toBe(5);
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

  it("recognizes branded secret API values through their type policy", () => {
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
