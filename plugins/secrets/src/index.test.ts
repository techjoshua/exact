import { describe, expect, it } from 'vitest';
import { analyzeSource } from '@exact/compiler';
import { consume, secret } from './index.js';
import { parseEnvironmentFile } from './providers.js';
import createSecretsServerExtension, { createSecretResolver } from './server.js';

describe('@exact/secrets', () => {
	it('uses transparent runtime values and an identity consume boundary', () => {
		const combo = secret('CLIENT_KEY_AND_SECRET', 'client:credential');
		const [key, clientSecret] = combo.split(':');
		const authorization = `JWT-Bearer - ${key}:${clientSecret}`;
		expect(authorization).toBe('JWT-Bearer - client:credential');
		expect(consume(authorization)).toBe(authorization);
	});

	it('records call-argument application-owned secret consumption', () => {
		const manifest = analyzeSource(
			`
      import { consume, type Secret } from "@exact/secrets";
      declare const secrets: { require(name: string): Secret<string> };
      const apiKey = secrets.require("STRIPE_SECRET_KEY");
      function createClient(value: string) { return { ok: true }; }
      export const client = createClient(consume(apiKey));
    `,
			{
				filename: 'app.ts',
				packageType: 'application',
				packageName: '@acme/app',
				target: 'server'
			}
		);
		expect(manifest.policy.secretConsumers).toEqual([
			expect.objectContaining({
				selector: 'STRIPE_SECRET_KEY',
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({ package: '@acme/app', symbol: 'consume', parameter: 0 })
			})
		]);
	});

	it('trusts application consumption without authorizing the later receiver', () => {
		const source = `
      import { consume, type Secret } from "@exact/secrets";
      import { createClient } from "@acme/payments";
      declare const secrets: { require(name: string): Secret<string> };
      const apiKey = secrets.require("STRIPE_SECRET_KEY");
      export const client = createClient(consume(apiKey));
    `;
		const manifest = analyzeSource(
			`
      ${source}
    `,
			{
				filename: 'app.ts',
				packageType: 'application',
				packageName: '@acme/app',
				target: 'server'
			}
		);
		expect(manifest.policy.secretConsumers[0]).toEqual(
			expect.objectContaining({
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({ package: '@acme/app', symbol: 'consume' })
			})
		);

		const denied = analyzeSource(source.replace('consume(apiKey)', 'apiKey'), {
			filename: 'app.ts',
			packageType: 'application',
			packageName: '@acme/app',
			target: 'server'
		});
		expect(
			denied.diagnostics.some((value) => value.includes('Secret<T> parameter or consume()'))
		).toBe(true);
	});

	it('uses the package allowlist for dependencies that contain consume()', () => {
		const dependency = analyzeSource(
			`
      import { consume } from "@exact/secrets";
      /** @exact keep=secret */
      declare const apiKey: string;
      export const raw = consume(apiKey);
    `,
			{
				filename: 'payments.ts',
				packageType: 'library',
				packageName: '@acme/payments',
				target: 'server'
			}
		);
		const manifest = analyzeSource('export {};', {
			filename: 'app.ts',
			packageType: 'application',
			packageName: '@acme/app',
			target: 'server',
			importedManifests: [dependency],
			pluginRegistry: {
				fingerprint: 'secrets-config',
				plugins: {
					'@exact/secrets': {
						packageName: '@exact/secrets',
						version: '1.0.0',
						protocolVersion: '1.0.0',
						required: true,
						cacheKey: {
							policyVersion: 3,
							allowPackages: ['@acme/payments']
						}
					}
				}
			}
		});

		expect(
			manifest.diagnostics.some((value) => value.includes('not in secrets.allowPackages'))
		).toBe(false);
		const denied = analyzeSource('export {};', {
			filename: 'app.ts',
			packageType: 'application',
			packageName: '@acme/app',
			target: 'server',
			importedManifests: [dependency]
		});
		expect(denied.diagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining('dependency @acme/payments consumes a secret')
			])
		);
	});

	it('does not treat consuming-package permission as selector policy', () => {
		const manifest = analyzeSource(
			`
      import { consume } from "@exact/secrets";
      /** @exact keep=secret */
      declare const apiKey: string;
      export const raw = consume(apiKey);
    `,
			{
				filename: 'payments.ts',
				packageType: 'library',
				packageName: '@acme/payments',
				target: 'server'
			}
		);
		expect(manifest.policy.secretConsumers[0]?.authorization).toBe('library-requirement');
		expect(manifest.policy.secretConsumers[0]?.selector).toBeUndefined();
	});

	it('trusts the package containing consume() without authorizing downstream receivers', () => {
		const dependency = analyzeSource(
			`
      import { consume, type Secret } from "@exact/secrets";
      import { charge } from "@untrusted/gateway";
      export function createClient(value: Secret<string>) {
        return charge(consume(value));
      }
    `,
			{
				filename: 'payments.ts',
				packageType: 'library',
				packageName: '@acme/payments',
				target: 'server'
			}
		);
		const manifest = analyzeSource('export {};', {
			filename: 'app.ts',
			packageType: 'application',
			packageName: '@acme/app',
			target: 'server',
			importedManifests: [dependency],
			capabilityPolicy: {
				secrets: {
					allowPackages: ['@acme/payments']
				}
			}
		});
		expect(dependency.policy.secretConsumers).toEqual([
			expect.objectContaining({
				authorization: 'library-requirement',
				consumer: expect.objectContaining({ package: '@acme/payments', symbol: 'consume' })
			})
		]);
		expect(
			dependency.policy.secretConsumers.some(
				(consumer) => consumer.consumer.package === '@untrusted/gateway'
			)
		).toBe(false);
		expect(manifest.diagnostics.some((value) => value.includes('allowPackages'))).toBe(false);
	});

	it('tracks local secret forwarding by binding identity instead of shadowed names', () => {
		const manifest = analyzeSource(
			`
      import { consume } from "@exact/secrets";
      import { send } from "@untrusted/gateway";
      /** @exact keep=secret */
      declare const apiKey: string;

      function useLocally() {
        function forward(value: string) {
          return value;
        }
        return forward(consume(apiKey));
      }

      function forward(value: string) {
        return send(value);
      }

      export const result = useLocally();
    `,
			{
				filename: 'app.ts',
				packageType: 'application',
				packageName: '@acme/app',
				target: 'server'
			}
		);

		expect(manifest.policy.secretConsumers).toEqual([
			expect.objectContaining({
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({
					package: '@acme/app',
					symbol: 'consume',
					parameter: 0
				})
			})
		]);
		expect(
			manifest.policy.secretConsumers.some(
				(consumer) => consumer.consumer.package === '@untrusted/gateway'
			)
		).toBe(false);
	});

	it('stops tracking after consumption inside an application helper call', () => {
		const manifest = analyzeSource(
			`
      import { consume } from "@exact/secrets";
      import { send } from "@acme/gateway";
      /** @exact keep=secret */
      declare const apiKey: string;

      function createClient(value: string) {
        return send(value);
      }

      export const client = createClient(consume(apiKey));
    `,
			{
				filename: 'app.ts',
				packageType: 'application',
				packageName: '@acme/app',
				target: 'server',
				capabilityPolicy: {
					secrets: {
						allowPackages: ['@acme/gateway']
					}
				}
			}
		);

		expect(manifest.policy.secretConsumers).toEqual([
			expect.objectContaining({
				authorization: 'implicit-application-owner',
				consumer: expect.objectContaining({ package: '@acme/app', symbol: 'consume' })
			})
		]);
		expect(
			manifest.policy.secretConsumers.some(
				(consumer) => consumer.consumer.package === '@acme/gateway'
			)
		).toBe(false);
		expect(manifest.diagnostics).not.toEqual(
			expect.arrayContaining([expect.stringContaining('Secret<T> parameter or consume()')])
		);
	});

	it('rejects secret consumers retained in client compilation', () => {
		const manifest = analyzeSource(
			`
      import { consume, type Secret } from "@exact/secrets";
      declare const secrets: { require(name: string): Secret<string> };
      const apiKey = secrets.require("API_KEY");
      function connect(value: string) {}
      connect(consume(apiKey));
    `,
			{
				filename: 'client.ts',
				packageType: 'application',
				packageName: '@acme/app',
				target: 'client'
			}
		);
		expect(manifest.diagnostics.some((value) => value.includes('client artifact'))).toBe(true);
	});

	it('parses environment providers without exposing values in errors', () => {
		expect(parseEnvironmentFile("API_KEY=credential\nQUOTED='value here'")).toEqual(
			new Map([
				['API_KEY', 'credential'],
				['QUOTED', 'value here']
			])
		);
		expect(() => parseEnvironmentFile('not valid')).toThrow(
			'Malformed environment secret declaration'
		);
	});

	it('fails server startup when a required secret is unavailable', async () => {
		const resolver = createSecretResolver(
			{
				providers: [
					{
						name: 'empty',
						async load() {
							return {};
						}
					}
				],
				required: ['DATABASE_URL'],
				allowPackages: []
			},
			{
				applicationRoot: '/app',
				environment: 'test',
				signal: new AbortController().signal
			}
		);
		await expect(createSecretsServerExtension(resolver).validate?.()).rejects.toThrow(
			'Required secret DATABASE_URL is not configured'
		);
	});

	it('provides application code with a direct secret resolver', async () => {
		const resolver = createSecretResolver(
			{
				providers: [
					{
						name: 'fixture',
						async load() {
							return { API_KEY: secret('API_KEY', 'credential') };
						}
					}
				],
				required: [],
				allowPackages: ['@acme/payments']
			},
			{
				applicationRoot: '/app',
				environment: 'test',
				signal: new AbortController().signal
			}
		);
		await resolver.initialize();
		expect(resolver.require('API_KEY')).toBe('credential');
		expect(resolver.require('API_KEY').split('e')).toEqual(['cr', 'd', 'ntial']);
		const rawApiKey: string = consume(resolver.require('API_KEY'));
		expect(rawApiKey).toBe('credential');
		expect(resolver.optional('MISSING')).toBeUndefined();
	});
});
