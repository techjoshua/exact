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
		} finally {
			await vite.close();
		}

		expect(warnings.join('\n')).not.toContain('dynamic import cannot be analyzed');
		expect(warnings.join('\n')).not.toContain('@vite-ignore');
	}, 30_000);
});
