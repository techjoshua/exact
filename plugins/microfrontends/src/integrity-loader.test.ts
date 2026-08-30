/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/testing';
import { loadExactRemoteModule } from './client.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const loaderSymbol = Symbol.for('@exactjs/microfrontends/remote-loader');
const IntegrityArea = createExactFrameworkFixtureArtifact(
	function IntegrityArea() {},
	'@company/integrity#./Area'
);

describe('remote entry integrity loading', () => {
	it('rejects malformed metadata before creating executable module state', async () => {
		await expect(
			loadExactRemoteModule('https://cdn.example.test/invalid-integrity.js', 'md5-nope')
		).rejects.toThrow('invalid integrity metadata');
	});

	it('uses a browser integrity-checked module script before accepting a generated entry', async () => {
		const append = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
			const script = nodes[0] as HTMLScriptElement;
			queueMicrotask(() => {
				const token = new URL(script.src).searchParams.get('__exact_module_token');
				const loader = Reflect.get(globalThis, loaderSymbol) as {
					publish(token: string | null, value: unknown): void;
				};
				loader.publish(token, {
					buildKey,
					root: '@company/integrity#./Area',
					component: IntegrityArea,
					registration: {}
				});
			});
		});

		const loaded = await loadExactRemoteModule(
			'https://cdn.example.test/integrity.js',
			'sha384-YWJj'
		);
		const script = append.mock.calls[0]![0] as HTMLScriptElement;
		expect(script.type).toBe('module');
		expect(script.integrity).toBe('sha384-YWJj');
		expect(script.crossOrigin).toBe('anonymous');
		expect(loaded.root).toBe('@company/integrity#./Area');
	});
});
