import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import parcelLabViteConfig from '../vite.config.js';

describe('shipping development inspection', () => {
	it('loads the eXact runtime bootstrap through the application Vite configuration', async () => {
		const vite = await createServer({
			...parcelLabViteConfig,
			configFile: false,
			appType: 'custom',
			server: { middlewareMode: true }
		});
		try {
			const html = await vite.transformIndexHtml(
				'/',
				'<main id="app"></main><script type="module" src="/src/client.ts"></script>'
			);
			expect(html).toContain('virtual:exact/devtools-runtime');
			expect(html.indexOf('virtual:exact/devtools-runtime')).toBeLessThan(
				html.indexOf('/src/client.ts')
			);
		} finally {
			await vite.close();
		}
	}, 30_000);
});
