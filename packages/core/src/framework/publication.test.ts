import { reactive, watch } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createFrameworkPublicationCommit } from './publication.js';

describe('framework publication', () => {
	it('settles its rendered receipt after reactive consequences flush', async () => {
		const state = reactive({ value: 0 });
		let observed = -1;
		watch(() => {
			observed = state.value;
		});

		state.value = 1;
		const commit = createFrameworkPublicationCommit();
		await commit.rendered;

		expect(observed).toBe(1);
	});
});
