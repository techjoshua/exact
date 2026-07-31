import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource, transform } from './index.js';

const fixture = (name: string) => path.join(process.cwd(), `${name}.policy-fixture.tsx`);

describe('generic data policy IR', () => {
	it('records explicit fields and inferred shared island transfers', () => {
		const manifest = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import type { Component } from "@exactjs/core";\n      interface State {\n        /** @exact keep=server */ internal: string;\n        title: string;\n      }\n      export function Panel(this: Component<State>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.server()) => { this.state.title = "ready"; };\nrunFixtureTask();\n        return () => <button title={this.state.title} onClick={() => this.state.title = "next"} />;\n      }\n    ',
			{ filename: fixture('manifest') }
		);

		expect(manifest.version).toBe(1);
		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'state',
					path: 'internal',
					policy: { residency: 'server', secret: false },
					source: 'annotation'
				}),
				expect.objectContaining({
					kind: 'state',
					path: 'title',
					policy: { residency: 'shared', secret: false },
					source: 'inference'
				})
			])
		);
		expect(manifest.policy.flows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'transfer',
					boundary: 'client-island',
					authorized: true,
					policy: { residency: 'shared', secret: false }
				}),
				expect.objectContaining({
					kind: 'projection',
					boundary: 'state',
					authorized: true
				})
			])
		);
	});

	it('defaults server-provisioned contexts to server residency', () => {
		const manifest = analyzeSource(
			`
      import { createContext } from "@exactjs/core";
      export const ComponentContext = createContext<string>("component");
      export const ApplicationContext = createContext<object>(
        "application",
        { scope: "application" }
      );
      export const RequestContext = createContext<object>(
        "request",
        { global: true, reactive: false, scope: "request" }
      );
    `,
			{ filename: fixture('context-default-residency') }
		);

		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'ComponentContext',
					policy: { residency: 'shared', secret: false },
					source: 'inference'
				}),
				expect.objectContaining({
					name: 'ApplicationContext',
					policy: { residency: 'server', secret: false },
					source: 'inference'
				}),
				expect.objectContaining({
					name: 'RequestContext',
					policy: { residency: 'server', secret: false },
					source: 'inference'
				})
			])
		);
	});

	it('allows explicit shared projections but never clears secret qualification', () => {
		const shared = analyzeSource(
			`
      /** @exact keep=server */ const record = { id: "p1", name: "Desk" };
      /** @exact shared */ const product = { id: record.id, name: record.name };
      export { product };
    `,
			{ filename: fixture('shared-projection') }
		);
		expect(shared.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'product',
					policy: { residency: 'shared', secret: false },
					source: 'annotation'
				})
			])
		);

		const secret = analyzeSource(
			`
      /** @exact keep=secret */ const token = "configured";
      /** @exact shared */ const leaked = { token };
      export { leaked };
    `,
			{ filename: fixture('shared-secret-conflict') }
		);
		expect(secret.diagnostics).toContain(
			'error: @exact shared declaration leaked cannot release secret-qualified data'
		);
	});

	it('applies shared callable contracts to resolved values without moving execution', () => {
		const manifest = analyzeSource(
			`
      import { createContext } from "@exactjs/core";
      interface Product { id: string; name: string }
      interface Repository {
        /** @exact shared */
        findPublicProducts(): Promise<Product[]>;
      }
      /** @exact keep=server */ declare const repository: Repository;
      const publicProducts = repository.findPublicProducts();
      const RepositoryContext = createContext<Repository>(
        "repository",
        { scope: "request" }
      );
      export function products(repository: Repository) {
        return repository.findPublicProducts();
      }
    `,
			{ filename: fixture('shared-return') }
		);

		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'return',
					name: 'repository.findPublicProducts',
					policy: { residency: 'shared', secret: false },
					source: 'annotation'
				}),
				expect.objectContaining({
					kind: 'declaration',
					name: 'publicProducts',
					policy: { residency: 'shared', secret: false },
					source: 'inference'
				})
			])
		);
	});

	it('rejects server-kept and secret state before island artifact emission', () => {
		expect(() =>
			transform(
				`
      import type { Component } from "@exactjs/core";
      interface State {
        /** @exact keep=secret */ credential: string;
      }
      export function Panel(this: Component<State>) {
        return () => <button title={this.state.credential} onClick={() => this.state.credential = "next"} />;
      }
    `,
				{ filename: fixture('protected-island'), target: 'server', serverComponents: true }
			)
		).toThrow('client island captures secret state path credential');
	});

	it('treats route loader and action results as hydration transfer sinks', () => {
		const manifest = analyzeSource(
			`
      import { consume, type Secret } from "@exactjs/secrets";
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
    `,
			{
				filename: fixture('route-hydration-policy'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(
			manifest.diagnostics.filter((diagnostic) =>
				diagnostic.includes('route loader hydration data')
			)
		).toHaveLength(2);
		expect(manifest.diagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining('server-kept value cannot enter route loader hydration data'),
				expect.stringContaining('secret value cannot enter route action hydration data')
			])
		);
		expect(manifest.policy.flows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ boundary: 'hydration', authorized: false })
			])
		);
	});

	it('uses protected state reads as task placement effects', () => {
		const manifest = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import type { Component } from "@exactjs/core";\n      interface State {\n        /** @exact keep=server */ internal: string;\n      }\n      export function Panel(this: Component<State>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { void this.state.internal; };\nrunFixtureTask();\n        return () => <p>Ready</p>;\n      }\n    ',
			{ filename: fixture('task-placement') }
		);

		expect(manifest.components[0]?.tasks[0]?.placement).toBe('server');
	});

	it('rejects explicit client tasks that access server-kept contexts', () => {
		expect(() =>
			transform(
				'import { TaskContext } from "@exactjs/core";\n\n      import { createContext, type Component } from "@exactjs/core";\n      export const AuthorizationContext = createContext<{ hasRole(role: string): boolean }>(\n        "authorization",\n        { global: true, keep: "server", scope: "request" }\n      );\n      export function Panel(this: Component<{}>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.client()) => { this.getContext(AuthorizationContext); };\nrunFixtureTask();\n        return () => <p>Ready</p>;\n      }\n    ',
				{ filename: fixture('context-placement'), target: 'client' }
			)
		).toThrow('client task reads or writes server-kept data');
	});

	it('keeps inferred public context calls neutral and protected context calls server-only', () => {
		const manifest = analyzeSource(
			`
      import { createContext, type Component } from "@exactjs/core";
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
    `,
			{ filename: fixture('context-call-effects') }
		);

		expect(
			manifest.components.find((component) => component.name === 'PublicPanel')?.placement
		).toBe('isomorphic');
		expect(
			manifest.components.find((component) => component.name === 'ServerPanel')?.placement
		).toBe('server');
	});

	it('propagates secret qualification through declaration aliases', () => {
		const manifest = analyzeSource(
			`
      /** @exact keep=secret */ const apiKey = "configured";
      const authorization = \`Bearer \${apiKey}\`;
      export { authorization };
    `,
			{ filename: fixture('propagation') }
		);

		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'apiKey',
					policy: { residency: 'server', secret: true },
					source: 'annotation'
				}),
				expect.objectContaining({
					name: 'authorization',
					policy: { residency: 'server', secret: true },
					source: 'inference'
				})
			])
		);
		expect(manifest.policy.flows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'propagation',
					policy: { residency: 'server', secret: true },
					authorized: true
				})
			])
		);
	});

	it('carries inferred return policy through local calls', () => {
		const manifest = analyzeSource(
			`
      /** @exact keep=secret */ const apiKey = "configured";
      function authorizationHeader() {
        return \`Bearer \${apiKey}\`;
      }
      const header = authorizationHeader();
      export { header };
    `,
			{ filename: fixture('return-propagation') }
		);

		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'return',
					name: 'authorizationHeader',
					policy: { residency: 'server', secret: true },
					source: 'inference'
				}),
				expect.objectContaining({
					kind: 'declaration',
					name: 'header',
					policy: { residency: 'server', secret: true },
					source: 'inference'
				})
			])
		);
	});

	it('recognizes transparent secret API values through their type policy', () => {
		const manifest = analyzeSource(
			`
      import { secret } from "@exactjs/secrets";
      const apiKey = secret("API_KEY", "configured");
      const authorization = \`Bearer \${apiKey}\`;
      export { authorization };
    `,
			{ filename: fixture('secret-type') }
		);

		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'apiKey',
					policy: { residency: 'server', secret: true }
				}),
				expect.objectContaining({
					name: 'authorization',
					policy: { residency: 'server', secret: true }
				})
			])
		);
		const subjectIds = new Set(manifest.policy.subjects.map((subject) => subject.id));
		expect(
			manifest.policy.flows.every(
				(flow) => subjectIds.has(flow.to) && flow.from.every((id) => subjectIds.has(id))
			)
		).toBe(true);
	});

	it('audits consume() itself and rejects a secret passed to an ordinary parameter', () => {
		const manifest = analyzeSource(
			`
      import { consume } from "@exactjs/secrets";
      /** @exact keep=secret */ const apiKey = "configured";
      function createStripeClient(value: string) {}
      function createSomeOtherClient(value: string) {}
      createStripeClient(consume(apiKey));
      createSomeOtherClient(apiKey);
      export {};
    `,
			{
				filename: fixture('call-site-consumption'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(manifest.policy.secretConsumers).toEqual([
			expect.objectContaining({
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({ symbol: 'consume' })
			})
		]);
		expect(manifest.diagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'secret argument requires an explicit Secret<T> parameter or consume()'
				)
			])
		);
	});

	it('stops tracking the result of a standalone consume() call', () => {
		const manifest = analyzeSource(
			`
      import { consume } from "@exactjs/secrets";
      /** @exact keep=secret */ const configuredApiKey = "configured";
      const apiKey = consume(configuredApiKey);
      function createStripeClient(value: string) {}
      function createSomeOtherClient(value: string) {}
      createStripeClient(apiKey);
      createSomeOtherClient(apiKey);
      export {};
    `,
			{
				filename: fixture('declaration-consumption'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(manifest.policy.secretConsumers).toEqual([
			expect.objectContaining({
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({ symbol: 'consume' })
			})
		]);
		expect(manifest.policy.subjects.some((subject) => subject.name === 'apiKey')).toBe(false);
	});

	it('rejects consume() on a non-secret argument', () => {
		const manifest = analyzeSource(
			`
      import { consume } from "@exactjs/secrets";
      const publicValue = "public";
      consume(publicValue);
      export {};
    `,
			{ filename: fixture('invalid-call-site-consumption') }
		);

		expect(manifest.diagnostics).toContain('error: consume() argument is not secret-qualified');
	});

	it('propagates secret qualification through method calls and destructuring until consume()', () => {
		const manifest = analyzeSource(
			`
      import { consume, type Secret } from "@exactjs/secrets";
      declare const secrets: { require(name: string): Secret<string> };
      const combo = secrets.require("ClientKeyAndSecret");
      const [key, clientSecret] = combo.split(":");
      const authorization = \`JWT-Bearer - \${key}:\${clientSecret}\`;
      const rawAuthorization = consume(authorization);
      export { key, clientSecret, authorization, rawAuthorization };
    `,
			{
				filename: fixture('derived-secret'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(manifest.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'combo', policy: { residency: 'server', secret: true } }),
				expect.objectContaining({ name: 'key', policy: { residency: 'server', secret: true } }),
				expect.objectContaining({
					name: 'clientSecret',
					policy: { residency: 'server', secret: true }
				}),
				expect.objectContaining({
					name: 'authorization',
					policy: { residency: 'server', secret: true }
				})
			])
		);
		expect(manifest.policy.subjects.some((subject) => subject.name === 'rawAuthorization')).toBe(
			false
		);
	});
});
