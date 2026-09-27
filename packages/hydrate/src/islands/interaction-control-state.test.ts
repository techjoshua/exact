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
