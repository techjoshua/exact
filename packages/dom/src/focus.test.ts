/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preserveFocus } from './focus.js';
import type { Root } from './types.js';

const root = { logger: undefined } as Root;

describe('@exactjs/dom focus preservation', () => {
	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('does not manufacture a focus transition when the document body owns focus', () => {
		const focus = vi.spyOn(document.body, 'focus');

		expect(document.activeElement).toBe(document.body);
		expect(preserveFocus(root, () => 'complete')).toBe('complete');
		expect(focus).not.toHaveBeenCalled();
	});

	it('restores a connected input and its selection after DOM work drops focus', () => {
		const input = document.createElement('input');
		input.value = 'ready';
		document.body.append(input);
		input.focus();
		input.setSelectionRange(1, 4, 'backward');

		preserveFocus(root, () => {
			input.remove();
			document.body.append(input);
		});

		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(1);
		expect(input.selectionEnd).toBe(4);
		expect(input.selectionDirection).toBe('backward');
	});
});
