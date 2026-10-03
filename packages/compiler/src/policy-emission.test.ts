import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';
import { createTestWorkspace, writeTestFiles } from './test-support/workspace.js';

const fixture = (name: string) => path.join(process.cwd(), `${name}.policy-fixture.tsx`);

describe('policy emission and sinks', () => {
	it('preserves compiler-derived qualification in emitted TypeScript', () => {
		const output = transform(
			`
      import { secret, type Secret } from "@exactjs/secrets";
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
    `,
			{
				filename: fixture('secret-type-preservation'),
				packageType: 'application',
				target: 'server',
				generatedValidation: 'semantic'
			}
		);

		expect(output).toContain('import type { Secret as __ExactSecret } from "@exactjs/secrets";');
		expect(output).toMatch(/const header = `Bearer \$\{apiKey\}` as __ExactSecret<string>;/);
		expect(output).toMatch(/return `Derived \$\{value\}` as __ExactSecret<string>;/);
		expect(output).toMatch(/forward\(`Direct \$\{apiKey\}` as __ExactSecret<string>\)/);
	});

	it('allows an unconsumed secret only through an explicit Secret<T> parameter', () => {
		const analysis = analyzeSource(
			`
      import { secret, type Secret } from "@exactjs/secrets";
      const apiKey = secret("API_KEY", "configured");
      function preserve(value: Secret<string>) { return value; }
      function ordinary(value: string) { return value; }
      preserve(apiKey);
      ordinary(apiKey);
      export {};
    `,
			{
				filename: fixture('explicit-secret-parameter'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(analysis.policy.flows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ boundary: 'call', authorized: true }),
				expect.objectContaining({
					boundary: 'call',
					authorized: false,
					reason: expect.stringContaining(
						'secret argument requires an explicit Secret<T> parameter or consume()'
					)
				})
			])
		);
		expect(analysis.policy.secretConsumers).toEqual([]);
	});

	for (const target of ['default', 'client', 'server'] as const)
		for (const [name, declaration, type] of [
			['direct', '', 'Secret<string>'],
			['alias', 'type Credential = Secret<string>;', 'Credential'],
			['generic alias', 'type Credential<T> = Secret<T>;', 'Credential<string>'],
			['readonly alias', 'type Credential = Readonly<Secret<string>>;', 'Credential'],
			['intersection alias', 'type Credential = Secret<string> & { tag: true };', 'Credential'],
			['nullable alias', 'type Credential = Secret<string> | undefined;', 'Credential']
		]) {
			it(`preserves ${name} secret qualification at component output (${target})`, () => {
				const analysis = analyzeSource(
					`import type { Secret } from '@exactjs/secrets';
				${declaration}
				export function Panel(props: { token: ${type} }) {
					return () => <p>{String(props.token)}</p>;
				}`,
					{
						filename: fixture(`secret-type-${name}-${target}`),
						target: target === 'default' ? undefined : target
					}
				);
				expect(analysis.diagnostics).toContainEqual(
					expect.stringContaining('secret-qualified value cannot influence operation output')
				);
				expect(analysis.policy.subjects).toContainEqual(
					expect.objectContaining({ name: 'token', policy: { residency: 'server', secret: true } })
				);
			});
		}

	it('authorizes aliased secret parameters while rejecting ordinary lookalike parameters', () => {
		const analysis = analyzeSource(
			`import { secret, type Secret } from '@exactjs/secrets';
			type Credential = Secret<string>;
			type SecretLooking = string;
			const token = secret('TOKEN', 'configured');
			function preserve(value: Credential) { return value; }
			function ordinary(value: SecretLooking) { return value; }
			preserve(token);
			ordinary(token);`,
			{ filename: fixture('secret-alias-consumers'), target: 'server' }
		);
		const calls = analysis.policy.flows.filter((flow) => flow.boundary === 'call');
		expect(calls).toContainEqual(expect.objectContaining({ authorized: true }));
		expect(calls).toContainEqual(
			expect.objectContaining({
				authorized: false,
				reason: expect.stringContaining('Secret<T> parameter or consume()')
			})
		);
	});

	it('keeps similarly named ordinary types unqualified', () => {
		const analysis = analyzeSource(
			`interface SecretLooking { value: string }
			type Secret<T> = T;
			export function Panel(props: { token: SecretLooking; label: Secret<string> }) {
				return () => <p>{props.token.value}{props.label}</p>;
			}`,
			{ filename: fixture('ordinary-secret-lookalikes'), target: 'server' }
		);
		expect(analysis.diagnostics).toEqual([]);
		expect(analysis.policy.subjects.filter((subject) => subject.policy.secret)).toEqual([]);
	});

	it('tracks imported readonly fields and method results without tainting public siblings', async () => {
		const root = await createTestWorkspace('.exact-policy-types-', path.resolve('.tmp'));
		await writeTestFiles(root, {
			'contracts.ts': `import type { Secret } from '@exactjs/secrets';
			 export type Credential = Secret<string>;
			 export interface Inputs { token: Credential; label: string }
			 export interface Provider { /** @exact pure */ require(): Credential; /** @exact pure */ publicLabel(): string }
			 export type ReadonlyInputs = Readonly<Inputs>;`
		});
		for (const access of [
			'props.token',
			'props["token"]',
			'props[key]',
			'props[choice]',
			'provider.require()'
		]) {
			const analysis = analyzeSource(
				`import type {ReadonlyInputs,Provider} from './contracts.js';
				declare const provider:Provider;
				export function Panel(props:ReadonlyInputs){
					const key='token' as const; const choice:'token'|'label'=Math.random()?'token':'label';
					return()=> <p>{String(${access})}</p>;
				}`,
				{ filename: path.join(root, 'probe.tsx'), target: 'server' }
			);
			expect(analysis.diagnostics, access).toContainEqual(
				expect.stringContaining('secret-qualified value cannot influence operation output')
			);
		}
		const accepted = analyzeSource(
			`import type {ReadonlyInputs,Provider} from './contracts.js';
			declare const provider:Provider;
			export function Panel(props:ReadonlyInputs){
				return()=> <p>{props.label}{provider.publicLabel()}</p>;
			}`,
			{ filename: path.join(root, 'probe.tsx'), target: 'server' }
		);
		expect(accepted.diagnostics).toEqual([]);
		expect(accepted.components[0].placement).toBe('isomorphic');
	});

	it('protects secret-containing records and arrays while allowing public field selection', () => {
		for (const [type, read] of [
			['{token:Secret<string>;label:string}', 'JSON.stringify(props.value)'],
			['Readonly<{token:Secret<string>;label:string}>', 'JSON.stringify(props.value)'],
			['Secret<string>[]', 'JSON.stringify(props.value)'],
			['readonly Secret<string>[]', 'JSON.stringify(props.value)'],
			['Secret<string>[]', 'String(props.value[0])'],
			['Secret<string>[]', 'props.value.length'],
			['Map<string,Secret<string>>', 'String(props.value.get(key))'],
			['ReadonlyMap<string,Secret<string>>', 'props.value.has(key)'],
			['Set<Secret<string>>', 'props.value.size'],
			['ReadonlySet<Secret<string>>', 'props.value.size'],
			['Readonly<Record<string,Secret<string>>>', 'String(props.value[key])']
		]) {
			const analysis = analyzeSource(
				`import type {Secret} from '@exactjs/secrets';
				export function Panel(props:{value:${type}}){const key='selected';return()=> <p>{${read}}</p>;}`,
				{ filename: fixture('secret-containment'), target: 'server' }
			);
			expect(analysis.diagnostics, read).toContainEqual(
				expect.stringContaining('secret-qualified value cannot influence operation output')
			);
		}
		const accepted = analyzeSource(
			`import type {Secret} from '@exactjs/secrets';
			export function Panel(props:{value:{token:Secret<string>;label:string}}){
				return()=> <p>{props.value.label}</p>;
			}`,
			{ filename: fixture('secret-public-sibling'), target: 'server' }
		);
		expect(accepted.diagnostics).toEqual([]);
		expect(accepted.components[0].placement).toBe('isomorphic');
	});

	it('preserves secret contracts introduced by native interface augmentation', () => {
		const declarations = `import type {Secret} from '@exactjs/secrets';
		declare global { interface HTMLElement { credential:Secret<string> } }`;
		const rejected = analyzeSource(
			`${declarations}export function Panel(props:{element:HTMLElement}){return()=> <p>{String(props.element)}</p>;}`,
			{ filename: fixture('augmented-native-secret'), target: 'server' }
		);
		expect(rejected.diagnostics).toContainEqual(
			expect.stringContaining('secret-qualified value cannot influence operation output')
		);
		const accepted = analyzeSource(
			`${declarations}export function Panel(props:{element:HTMLElement}){return()=> <p>{props.element.id}</p>;}`,
			{ filename: fixture('augmented-native-public'), target: 'server' }
		);
		expect(accepted.diagnostics).toEqual([]);
	});

	it('applies secret type contracts to component state task placement', () => {
		for (const [type, path, read] of [
			['Secret<string>', 'token', 'token'],
			['Credential', 'token', 'token'],
			['Readonly<Secret<string>>', 'token', 'token'],
			['readonly Credential[]', 'token', 'token'],
			['ReadonlyMap<string,Credential>', 'token', 'token'],
			['ReadonlySet<Credential>', 'token', 'token'],
			['Readonly<Record<string,Credential>>', 'token', 'token'],
			['{credential:Credential;label:string}', 'token.credential', 'token.credential']
		]) {
			for (const placement of ['client', 'server'] as const) {
				const analysis = analyzeSource(
					`import {TaskContext,type Component} from '@exactjs/core';
					import type {Secret} from '@exactjs/secrets';
					type Credential=Secret<string>;
					${placement === 'server' ? '/** @exact server */' : ''}
					export function Panel(this:Component<{token:${type};label:string}>){
						function inspect(task:TaskContext=TaskContext.${placement}()){void this.state.${read};}
						${placement === 'server' ? 'inspect();return()=> <p>{this.state.label}</p>;' : 'return()=> <button onClick={()=>inspect()}>{this.state.label}</button>;'}
					}`,
					{ filename: fixture('secret-state-placement'), target: 'server' }
				);
				expect(analysis.policy.subjects).toContainEqual(
					expect.objectContaining({
						kind: 'state',
						path,
						policy: { residency: 'server', secret: true }
					})
				);
				const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.startsWith('error:'));
				if (placement === 'client') {
					expect(errors).toContainEqual(
						expect.stringContaining('client task reads or writes server-kept data')
					);
				} else {
					expect(errors).toEqual([]);
					expect(analysis.components[0].tasks[0].placement).toBe('server');
				}
			}
		}
	});

	it('rejects unconsumed secrets in native operation children, attributes, and spreads', () => {
		const analysis = analyzeSource(
			`
      import type { Component } from "@exactjs/core";
      /** @exact keep=secret */ const credential = "configured";
      export function Panel(this: Component<{}>) {
        const attributes = { title: credential };
        return () => <div {...attributes} data-secret={credential}>{credential}</div>;
      }
    `,
			{
				filename: fixture('secret-operation-sinks'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(analysis.diagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining('secret-qualified value cannot influence operation output'),
				expect.stringContaining('secret-qualified value cannot influence an operation attribute'),
				expect.stringContaining(
					'secret-qualified value cannot influence an operation spread attribute'
				)
			])
		);
		expect(analysis.policy.flows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ boundary: 'operation', authorized: false })
			])
		);
	});

	it('allows consume() to end tracking before deliberate server operation output', () => {
		const analysis = analyzeSource(
			`
      import { consume } from "@exactjs/secrets";
      import type { Component } from "@exactjs/core";
      /** @exact keep=secret */ const credential = "configured";
      export function Panel(this: Component<{}>) {
        return () => <div>{consume(credential)}</div>;
      }
    `,
			{
				filename: fixture('consumed-operation-sink'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(analysis.diagnostics.some((diagnostic) => diagnostic.includes('operation'))).toBe(false);
		expect(analysis.policy.secretConsumers).toEqual([
			expect.objectContaining({
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({ symbol: 'consume' })
			})
		]);
	});

	it('rejects direct and implicit secret influence on errors and console output', () => {
		const analysis = analyzeSource(
			`
      /** @exact keep=secret */ const credential = "configured";
      export function validate(candidate: string) {
        if (credential === candidate) {
          console.info("matched");
          throw new Error("matched");
        }
        throw credential;
      }
    `,
			{
				filename: fixture('secret-error-log-sinks'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(analysis.diagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'secret-qualified value cannot influence secret-controlled console output'
				),
				expect.stringContaining(
					'secret-qualified value cannot influence secret-controlled error behavior'
				),
				expect.stringContaining('secret-qualified value cannot influence a thrown error')
			])
		);
		expect(analysis.policy.flows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ boundary: 'log', authorized: false }),
				expect.objectContaining({ boundary: 'error', authorized: false })
			])
		);
	});

	it('propagates secret control dependencies through branch writes into operation sinks', () => {
		const analysis = analyzeSource(
			`
      import type { Component } from "@exactjs/core";
      /** @exact keep=secret */ const credential = "configured";
      export function Panel(this: Component<{}>) {
        let label = "not matched";
        if (credential === "expected") {
          label = "matched";
        }
        return () => <div>{label}</div>;
      }
    `,
			{
				filename: fixture('secret-control-write'),
				packageType: 'application',
				target: 'server'
			}
		);

		expect(analysis.policy.subjects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'label',
					policy: { residency: 'server', secret: true },
					source: 'inference'
				})
			])
		);
		expect(analysis.diagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining('secret-qualified value cannot influence operation output')
			])
		);
	});

	it('omits server-kept exported declarations from client artifacts', () => {
		const source = `
      /** @exact keep=server */ export const internalConfiguration = { region: "west" };
      export const publicConfiguration = { name: "Example" };
    `;
		const client = transform(source, {
			filename: fixture('export-placement'),
			target: 'client',
			serverComponents: true
		});
		const analysis = analyzeSource(source, { filename: fixture('export-placement-analysis') });

		expect(client).not.toContain('internalConfiguration');
		expect(client).toContain('publicConfiguration');
		expect(analysis.exports).toContainEqual({
			name: 'internalConfiguration',
			kind: 'value',
			placement: 'server'
		});
	});
});
