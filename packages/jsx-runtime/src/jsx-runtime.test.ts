import { describe, expect, it } from 'vitest';
import { _, Fragment, jsx, jsxDEV, jsxs } from './jsx-runtime.js';

describe('@exactjs/jsx', () => {
	it.each([
		['jsx', () => jsx('p', { children: 'text' })],
		['jsxs', () => jsxs(Fragment, { children: ['a', 'b'] })],
		['jsxDEV', () => jsxDEV('p', { children: 'text' })]
	])('rejects an uncompiled %s call', (_name, invoke) => {
		expect(invoke).toThrow(/must be lowered by the eXact compiler/);
	});

	it('exports underscore as the keyed fragment JSX marker', () => {
		expect(_).toBe(Fragment);
	});
});
