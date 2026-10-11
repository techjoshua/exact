import { expect, it, vi } from 'vitest';
import exactWebpackLoader from './loader.js';

it.each(['?raw', '?url', '?raw&example=1'])(
	'preserves host asset bytes in explicit loader composition: %s',
	(resourceQuery) => {
		const source = 'export function Probe(){return()=> <p>source example</p>;}';
		const callback = vi.fn();
		const getOptions = vi.fn(() => {
			throw new Error('Asset requests must not create compiler owners');
		});
		exactWebpackLoader.call(
			{ resourcePath: '/src/Probe.tsx', resourceQuery, callback, getOptions },
			source
		);
		expect(callback).toHaveBeenCalledExactlyOnceWith(null, source);
		expect(getOptions).not.toHaveBeenCalled();
	}
);
