import { describe, expect, it, vi } from 'vitest';
import {
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram
} from '../render-program.js';
import { createPreparedServerKeyedChild } from './server-keyed-child.js';

const program = prepareCompiledRenderProgram({
	version: 1,
	id: 'keyed-root',
	namespace: 'html',
	ssr: (operations, _context, _invocation, output) => {
		operations.static(output, '<li>Ready</li>');
		return output;
	},
	ssrHost: 'li'
});

describe('compiler-proven keyed server programs', () => {
	it('retains the issued program while evaluating its key exactly once', () => {
		const value = createPreparedServerRenderProgram(program, []);
		const toString = vi.fn(() => 'row');
		expect(createPreparedServerKeyedChild(value, { toString }, true)).toBe(value);
		expect(toString).toHaveBeenCalledOnce();
	});
	it.each([null, undefined])('rejects missing keys even when no wrapper is needed', (key) => {
		const value = createPreparedServerRenderProgram(program, []);
		expect(() => createPreparedServerKeyedChild(value, key, true)).toThrow('require a key');
	});
	it('preserves key conversion failures before returning the program', () => {
		const value = createPreparedServerRenderProgram(program, []);
		const error = new Error('key conversion');
		expect(() =>
			createPreparedServerKeyedChild(
				value,
				{
					toString() {
						throw error;
					}
				},
				true
			)
		).toThrow(error);
	});
});
