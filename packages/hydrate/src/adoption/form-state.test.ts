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

it('captures dirty and focused controls together with nested hydration markers', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<input id="clean" value="unchanged"><section><input id="dirty" value="server"><textarea>server</textarea><select><option selected>a</option><option>b</option></select><!--exact:component--></section>';
	document.body.appendChild(container);
	try {
		const clean = container.querySelector<HTMLInputElement>('#clean')!;
		const dirty = container.querySelector<HTMLInputElement>('#dirty')!;
		const textarea = container.querySelector('textarea')!;
		const select = container.querySelector('select')!;
		dirty.value = 'typed';
		textarea.value = 'edited';
		select.value = 'b';
		const first = captureHydrationDom(container, createDomWorkBudget());
		expect(first.hasMarkers).toBe(true);
		expect(first.formState.map((state) => state.node)).toEqual([dirty, textarea, select]);
		clean.focus();
		const focused = captureHydrationDom(container, createDomWorkBudget());
		expect(focused.formState.map((state) => state.node)).toEqual([clean, dirty, textarea, select]);
		dirty.value = 'reset';
		textarea.value = 'reset';
		select.value = 'a';
		restoreFormState(container, focused.formState, createDomWorkBudget());
		expect([dirty.value, textarea.value, select.value]).toEqual(['typed', 'edited', 'b']);
		expect(document.activeElement).toBe(clean);
	} finally {
		container.remove();
	}
});
