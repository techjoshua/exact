import { createLogger, createServer, type ViteDevServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { exact } from '@exactjs/vite-plugin';

describe('shipping development SSR graph', () => {
	it('loads the server application without analyzing Node-only config imports', async ({
		signal,
		onTestFinished
	}) => {
		const lifetime = new AbortController();
		const cancelled = AbortSignal.any([signal, lifetime.signal]);
		let stage = 'startup';
		let progress = () => {};
		let vite: ViteDevServer | undefined;
		let http: ReturnType<typeof createHttpServer> | undefined;
		let handler: Promise<void> | undefined;
		let closingVite: Promise<void> | undefined;
		let cleaning: Promise<void> | undefined;
		let failed = false;
		const warning = setTimeout(
			() => console.warn(`Shipping SSR test is still working after 30s (${stage})`),
			30_000
		);

		/** Bounds inactivity within one Vite operation, renewing only after completed compiler/module work. */
		const awaitVite = async <T>(
			name: string,
			work: () => Promise<T>,
			cancellation: AbortSignal | null = cancelled
		): Promise<T> => {
			cancellation?.throwIfAborted();
			stage = name;
			let timer: ReturnType<typeof setTimeout>;
			let abort = () => {};
			const stalled = new Promise<never>((_, reject) => {
				progress = () => {
					clearTimeout(timer);
					timer = setTimeout(() => {
						const error = new Error(`${name} made no compiler/module progress for 30s`);
						lifetime.abort(error);
						reject(error);
					}, 30_000);
				};
				abort = () => reject(cancellation!.reason);
				cancellation?.addEventListener('abort', abort, { once: true });
				progress();
				if (cancellation?.aborted) abort();
			});
			try {
				return await Promise.race([
					Promise.resolve().then(() => {
						cancellation?.throwIfAborted();
						return work();
					}),
					stalled
				]);
			} finally {
				clearTimeout(timer!);
				cancellation?.removeEventListener('abort', abort);
				progress = () => {};
			}
		};
		/** Coalesces disposal, including a server returned after startup cancellation. */
		const closeVite = () => {
			if (!vite) return Promise.resolve();
			const server = vite;
			return (closingVite ??= awaitVite('Vite close', () => server.close(), null).catch(
				async (error) => {
					try {
						await awaitVite('Vite watcher close', () => server.watcher.close(), null);
					} catch (cleanupError) {
						console.error('Vite watcher cleanup failed', cleanupError);
					}
					throw error;
				}
			));
		};
		/** Releases this test's HTTP work and Vite resources once, attempting both cleanup owners. */
		const cleanup = () =>
			(cleaning ??= (async () => {
				clearTimeout(warning);
				lifetime.abort(new Error('Shipping SSR test finished'));
				const errors: unknown[] = [];
				try {
					if (http) {
						const server = http;
						let timer: ReturnType<typeof setTimeout>;
						try {
							const closed = new Promise<void>((resolve, reject) =>
								server.close((error) => {
									if (error && !('code' in error && error.code === 'ERR_SERVER_NOT_RUNNING'))
										reject(error);
									else resolve();
								})
							);
							server.closeAllConnections();
							await Promise.race([
								Promise.all([closed, handler]),
								new Promise<never>((_, reject) => {
									timer = setTimeout(
										() => reject(new Error('Shipping HTTP cleanup did not settle in 5s')),
										5_000
									);
								})
							]);
						} finally {
							clearTimeout(timer!);
						}
					}
				} catch (error) {
					errors.push(error);
				}
				try {
					await closeVite();
				} catch (error) {
					errors.push(error);
				}
				if (errors.length) throw new AggregateError(errors, 'Shipping SSR cleanup failed');
			})());
		onTestFinished(async () => {
			try {
				await cleanup();
			} catch (error) {
				if (!failed) throw error;
			}
		});
		const warnings: string[] = [];
		const logger = createLogger('silent');
		logger.warn = (message) => {
			warnings.push(message);
		};
		logger.warnOnce = (message) => {
			warnings.push(message);
		};
		try {
			await awaitVite('Vite startup', () =>
				createServer({
					configFile: false,
					appType: 'custom',
					customLogger: logger,
					plugins: [
						exact({
							renderMode: 'hydrate',
							onProfile: (event) => {
								if (event.phase === 'native-request' || event.phase === 'transform') progress();
							}
						})
					],
					server: { middlewareMode: true }
				}).then(async (server) => {
					vite = server;
					if (cancelled.aborted) {
						try {
							await closeVite();
						} catch (error) {
							console.error('Late shipping Vite cleanup failed', error);
						}
						throw cancelled.reason;
					}
					return server;
				})
			);
			const server = vite!;
			const { handleParcelLabRequest } = await awaitVite('server application import', () =>
				server.ssrLoadModule('/src/server-app.tsx')
			);
			let renderError: unknown;
			http = createHttpServer((request, response) => {
				handler = handleParcelLabRequest(request, response, {
					clientScript: '/src/client.ts'
				}).catch((error: unknown) => {
					renderError = error;
					response.statusCode = 500;
					response.end(error instanceof Error ? error.stack : String(error));
				});
			});
			stage = 'HTTP request';
			const request = new AbortController();
			const requestSignal = AbortSignal.any([cancelled, request.signal]);
			const requestTimer = setTimeout(
				() => request.abort(new Error('Shipping HTTP request did not settle in 30s')),
				30_000
			);
			try {
				http.listen(0, '127.0.0.1');
				await once(http, 'listening', { signal: requestSignal });
				const address = http.address();
				if (!address || typeof address === 'string') throw new Error('Test server did not bind');
				const response = await fetch(`http://127.0.0.1:${address.port}/`, {
					signal: requestSignal
				});
				const html = await response.text();
				expect(renderError).toBeUndefined();
				expect(response.status).toBe(200);
				expect(html).toContain('Find the right way to send it.');
			} finally {
				clearTimeout(requestTimer);
				request.abort();
			}
			const { ShippingCalculatorPage } = await awaitVite('generated component import', () =>
				server.ssrLoadModule('/.exact/App.exact.server.ts')
			);
			const { createCompiledComponentInputReceipt } = await awaitVite('core import', () =>
				server.ssrLoadModule('@exactjs/core/runtime/component-operations')
			);
			const { renderToHydratableString } = await awaitVite('SSR import', () =>
				server.ssrLoadModule('@exactjs/ssr')
			);
			stage = 'direct SSR';
			const rendered = await renderToHydratableString(
				createCompiledComponentInputReceipt(ShippingCalculatorPage, {
					url: 'http://localhost:4175/'
				}),
				{ maxTaskPasses: 3, signal: AbortSignal.any([cancelled, AbortSignal.timeout(1_200)]) }
			);
			expect(rendered.html).toContain('Find the right way to send it.');
			expect(rendered.html).toContain('DOOP');
			expect(rendered.html).toContain('data-exact-client-name="CalculatorWorkspace"');
			expect(rendered.html).toContain('data-exact-client-resumption="true"');
			expect(rendered.html).toContain('src="/assets/us-states.svg"');
			expect(rendered.html).not.toContain('class="land state-');
			// Keep the map/markup budget independent of the page's generated theme stylesheet.
			const styles = rendered.html.match(/<style\b[^>]*>[\s\S]*?<\/style>/g) ?? [];
			expect(styles).toHaveLength(1);
			expect(Buffer.byteLength(styles.join(''))).toBeLessThan(20 * 1024);
			const markup = rendered.html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
			expect(Buffer.byteLength(markup)).toBeLessThan(40 * 1024);
			expect(warnings.join('\n')).not.toContain('dynamic import cannot be analyzed');
			expect(warnings.join('\n')).not.toContain('@vite-ignore');
		} catch (error) {
			failed = true;
			throw error;
		} finally {
			try {
				await cleanup();
			} catch (error) {
				if (!failed) {
					failed = true;
					throw error;
				}
				console.error('Shipping SSR test cleanup failed', error);
			}
		}
	}, 0);
});
