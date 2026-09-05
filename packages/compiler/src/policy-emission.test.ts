import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';

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
					reason: 'secret argument requires an explicit Secret<T> parameter or consume()'
				})
			])
		);
		expect(analysis.policy.secretConsumers).toEqual([]);
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
