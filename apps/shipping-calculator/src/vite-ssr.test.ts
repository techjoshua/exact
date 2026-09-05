import { createLogger, createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { exact } from '@exactjs/vite-plugin';

describe('shipping development SSR graph', () => {
	it('loads the server application without analyzing Node-only config imports', async () => {
		const warnings: string[] = [];
		const logger = createLogger('silent');
		logger.warn = (message) => {
			warnings.push(message);
		};
		logger.warnOnce = (message) => {
			warnings.push(message);
		};
		const vite = await createServer({
			configFile: false,
			appType: 'custom',
			customLogger: logger,
			plugins: [exact({ renderMode: 'hydrate' })],
			server: { middlewareMode: true }
		});
		try {
			const { handleParcelLabRequest } = await vite.ssrLoadModule('/src/server-app.tsx');
			let renderError: unknown;
			const http = createHttpServer((request, response) => {
				void handleParcelLabRequest(request, response, {
					clientScript: '/src/client.ts'
				}).catch((error: unknown) => {
					renderError = error;
					response.statusCode = 500;
					response.end(error instanceof Error ? error.stack : String(error));
				});
			});
			try {
				http.listen(0, '127.0.0.1');
				await once(http, 'listening');
				const address = http.address();
				if (!address || typeof address === 'string') throw new Error('Test server did not bind');
				const response = await fetch(`http://127.0.0.1:${address.port}/`);
				const html = await response.text();
				expect(renderError).toBeUndefined();
				expect(response.status).toBe(200);
				expect(html).toContain('Find the right way to send it.');
			} finally {
				http.close();
				await once(http, 'close');
			}
			const { ShippingCalculatorPage } = await vite.ssrLoadModule('/.exact/App.exact.server.ts');
			const { createCompiledComponentReceipt } = await vite.ssrLoadModule(
				'@exactjs/core/runtime/component-operations'
			);
			const { renderToHydratableStringAsync } = await vite.ssrLoadModule('@exactjs/ssr');
			const rendered = await renderToHydratableStringAsync(
				createCompiledComponentReceipt(ShippingCalculatorPage, {
					url: 'http://localhost:4175/'
				}),
				{ maxTaskPasses: 3, maxTaskDurationMs: 1_200 }
			);
			expect(rendered.html).toContain('Find the right way to send it.');
			expect(rendered.html).toContain('DOOP');
			expect(rendered.html).toContain('data-exact-client-name="CalculatorWorkspace"');
			expect(rendered.html).toContain('data-exact-client-resumption="true"');
			expect(rendered.html).toContain('src="/assets/us-states.svg"');
			expect(rendered.html).not.toContain('class="land state-');
			expect(Buffer.byteLength(rendered.html)).toBeLessThan(40 * 1024);
		} finally {
			await vite.close();
		}

		expect(warnings.join('\n')).not.toContain('dynamic import cannot be analyzed');
		expect(warnings.join('\n')).not.toContain('@vite-ignore');
	}, 30_000);
});
