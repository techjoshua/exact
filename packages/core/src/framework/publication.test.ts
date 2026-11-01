import { reactive, watch } from '@exactjs/reactive';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createFrameworkPublicationCommit } from './publication.js';

describe('framework publication', () => {
	it('settles its rendered receipt after reactive consequences flush', async () => {
		const state = reactive({ value: 0 });
		let observed = -1;
		const stop = watch(() => {
			observed = state.value;
		});
		onTestFinished(stop);

		state.value = 1;
		const commit = createFrameworkPublicationCommit();
		const rendered = commit.rendered;
		const alias: { rendered: PromiseLike<void> } = commit;
		alias.rendered = Promise.resolve();
		await rendered;
		expect(commit.rendered).not.toBe(rendered);

		expect(observed).toBe(1);
	});
});
