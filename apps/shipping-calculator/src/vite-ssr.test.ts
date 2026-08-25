import { createLogger, createServer } from 'vite';
import { describe, expect, it } from 'vitest';

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
			server: { middlewareMode: true }
		});
		try {
			await vite.ssrLoadModule('/src/server-app.ts');
			const { ShippingCalculatorPage } = await vite.ssrLoadModule('/.exact/App.exact.server.ts');
			const { createVNode } = await vite.ssrLoadModule('@exactjs/core');
			const { renderToHydratableStringAsync } = await vite.ssrLoadModule('@exactjs/ssr');
			const rendered = await renderToHydratableStringAsync(
				createVNode(ShippingCalculatorPage, { url: 'http://localhost:4175/' }),
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
