import { createServer } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { createWatchedTypeFixture } from '../../test-support/watched-type-fixture.js';

it('reloads unchanged SSR consumers after an erased type import changes', async () => {
	const fixture = await createWatchedTypeFixture();
	onTestFinished(fixture.dispose);
	const { exact } = await import('../dist/index.js');
	const server = await createServer({
		root: fixture.root,
		configFile: false,
		appType: 'custom',
		server: { middlewareMode: true },
		plugins: [
			exact({
				target: 'server',
				applicationRoot: fixture.root,
				serverComponents: true,
				reactCompatibility: false
			})
		]
	});
	try {
		for (const array of [false, true, false]) {
			await fixture.update(array);
			await expect
				.poll(
					async () => {
						const module = await server.ssrLoadModule('/entry.tsx');
						return module.render(array ? ['one', 'two'] : 'initial');
					},
					{ timeout: 10000 }
				)
				.toBe(array ? '<p>onetwo</p>' : '<p>initial</p>');
		}
	} finally {
		await server.close();
	}
}, 30000);
