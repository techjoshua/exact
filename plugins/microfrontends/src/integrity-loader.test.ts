/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, onTestFinished, vi } from 'vitest';
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

		onTestFinished(() => append.mockRestore());
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

it('releases the integrity script when its last caller cancels', async () => {
	const first = new AbortController();
	const second = new AbortController();
	const tasks: Promise<unknown>[] = [];
	onTestFinished(async () => {
		first.abort();
		second.abort();
		await Promise.allSettled(tasks);
	});
	const url = 'https://cdn.example.test/last-owner.js';
	const a = loadExactRemoteModule(url, 'sha256-AAAA', first.signal).catch((error) => error);
	const b = loadExactRemoteModule(url, 'sha256-AAAA', second.signal).catch((error) => error);
	tasks.push(a, b);
	const script = document.head.querySelector<HTMLScriptElement>('script[src*="last-owner.js"]')!;
	expect(script).not.toBeNull();
	const token = new URL(script.src).searchParams.get('__exact_module_token');
	first.abort(0);
	expect(await a).toBe(0);
	expect(script.isConnected).toBe(true);
	second.abort(null);
	expect(await b).toBeNull();
	expect(script.isConnected).toBe(false);
	const loader = Reflect.get(globalThis, loaderSymbol) as {
		publish(token: string | null, value: unknown): void;
	};
	loader.publish(token, { component: IntegrityArea });
	expect(script.isConnected).toBe(false);
});
