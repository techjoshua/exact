/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import {
	captureInteractionControlState,
	restoreInteractionControlState
} from './interaction-control-state.js';

it('leaves file selection browser-owned while replaying change notification', () => {
	const input = document.createElement('input');
	input.type = 'file';
	const writeValue = vi.spyOn(input, 'value', 'set');
	expect(captureInteractionControlState(input)).not.toHaveProperty('value');
	expect(() =>
		restoreInteractionControlState(input, { value: 'C:\\fakepath\\selected.txt' })
	).not.toThrow();
	restoreInteractionControlState(input, { value: '' });
	expect(writeValue).not.toHaveBeenCalled();
	writeValue.mockRestore();
});

it.each([false, true])(
	'preserves selection values across option reordering (multiple: %s)',
	(multiple) => {
		const select = document.createElement('select');
		select.multiple = multiple;
		select.innerHTML =
			'<option value="a">A</option><option value="b" selected>B</option><option value="c">C</option>';
		const snapshot = captureInteractionControlState(select);
		select.prepend(select.options[1]!);
		restoreInteractionControlState(select, snapshot);
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['b']);
		select.value = 'c';
		const next = captureInteractionControlState(select);
		select.append(select.options[0]!);
		restoreInteractionControlState(select, next);
		expect(select.value).toBe('c');
	}
);

it('preserves duplicate-value selections and does not select a substitute for a removed value', () => {
	const select = document.createElement('select');
	select.multiple = true;
	select.innerHTML =
		'<option value="same">First</option><option value="other">Other</option><option value="same" selected>Second</option>';
	const snapshot = captureInteractionControlState(select);
	select.prepend(select.options[1]!);
	restoreInteractionControlState(select, snapshot);
	expect(Array.from(select.selectedOptions, (option) => option.text)).toEqual(['Second']);
	for (const option of Array.from(select.options)) if (option.value === 'same') option.remove();
	restoreInteractionControlState(select, snapshot);
	expect(select.selectedOptions.length).toBe(0);
});

it.each(['removed', 'empty'] as const)('preserves an absent single selection: %s', (change) => {
	const select = document.createElement('select');
	select.innerHTML = '<option value="a">A</option><option value="b" selected>B</option>';
	if (change === 'empty') select.selectedIndex = -1;
	const snapshot = captureInteractionControlState(select);
	if (change === 'removed') select.options[1]!.remove();
	else select.value = 'a';
	restoreInteractionControlState(select, snapshot);
	expect(select.selectedIndex).toBe(-1);
	expect(select.value).toBe('');
	select.value = 'a';
	restoreInteractionControlState(select, captureInteractionControlState(select));
	expect(select.value).toBe('a');
});
