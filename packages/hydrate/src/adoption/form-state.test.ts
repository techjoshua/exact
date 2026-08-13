/**
 * @vitest-environment jsdom
 */
import { createDomWorkBudget } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { captureHydrationDom, restoreFormState } from './form-state.js';

describe('hydration form-state restoration', () => {
	it('restores a retained dirty control without indexing the hydrated DOM', () => {
		const container = document.createElement('main');
		container.innerHTML = '<input id="query" value="server">';
		const input = container.querySelector('input')!;
		input.value = 'typed before hydration';
		const snapshot = captureHydrationDom(container, createDomWorkBudget(10));

		const restored = restoreFormState(container, snapshot.formState, createDomWorkBudget(1));

		expect(restored).toEqual([input]);
		expect(input.value).toBe('typed before hydration');
	});
});
