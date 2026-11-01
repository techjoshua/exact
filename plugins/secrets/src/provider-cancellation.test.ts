import { expect, it } from 'vitest';
import { environmentSecrets } from './providers.js';

it.each([true, false])(
	'does not start environment loading with an already-cancelled context, process environment=%s',
	async (includeProcessEnvironment) => {
		const controller = new AbortController();
		const reason = new Error('provider cancelled');
		controller.abort(reason);
		const provider = environmentSecrets({ includeProcessEnvironment, files: [] });
		await expect(
			provider.load({ applicationRoot: '/app', environment: 'test', signal: controller.signal })
		).rejects.toBe(reason);
	}
);

it('preserves cancellation during optional environment-file loading', async () => {
	const controller = new AbortController();
	const reason = new Error('file load cancelled');
	const provider = environmentSecrets({ includeProcessEnvironment: false, files: ['missing.env'] });
	const pending = provider.load({
		applicationRoot: '/exact-cancelled-provider',
		environment: 'test',
		signal: controller.signal
	});
	controller.abort(reason);
	await expect(pending).rejects.toBe(reason);
});
