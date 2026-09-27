import { createServer } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';
import { createConfigurationWatchFixture } from '../../test-support/configuration-watch.js';

it('matches fresh SSR after package enhancement configuration changes', async () => {
	const fixture = await createConfigurationWatchFixture();
	onTestFinished(fixture.dispose);
	const open = () =>
		createServer({
			root: fixture.root,
			configFile: false,
			appType: 'custom',
			logLevel: 'silent',
			plugins: [
				exact({ applicationRoot: fixture.root, serverComponents: true, reactCompatibility: false })
			],
			server: { middlewareMode: true }
		});
	const warm = await open();
	try {
		const read = async (server: Awaited<ReturnType<typeof open>>) =>
			(await server.ssrLoadModule('/entry.tsx')).render() as Promise<boolean>;
		expect(await read(warm)).toBe(true);
		expect((await warm.transformRequest('/page.tsx'))?.code).toContain('registerExactEnhancement');
		for (const enabled of [false, true, null, true]) {
			await fixture.configure(enabled);
			await expect.poll(() => read(warm), { timeout: 10000 }).toBe(enabled === true);
			expect(
				(await warm.transformRequest('/page.tsx'))?.code.includes('registerExactEnhancement')
			).toBe(enabled === true);
			const cold = await open();
			try {
				expect(await read(warm)).toBe(await read(cold));
			} finally {
				await cold.close();
			}
		}
	} finally {
		await warm.close();
	}
}, 30000);
