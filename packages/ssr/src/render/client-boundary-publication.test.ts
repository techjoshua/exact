/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { publishClientBoundary } from './client-boundary-publication.js';

it.each([false, true])('retains descendant resumptions for finite=%s islands', (finite) => {
	const context = createSsrContext({});
	const records = [['child', [[0, 7]]]] as const;
	const html = publishClientBoundary(
		context,
		'Parent',
		'parent',
		{ label: 'example' },
		'eager',
		finite,
		'<p>7</p>',
		records
	);
	const container = document.createElement('div');
	container.innerHTML = html;
	const island = container.firstElementChild!;
	expect(JSON.parse(island.getAttribute('data-exact-client-props')!)).toEqual({
		props: { label: 'example' },
		resumptions: records
	});
	expect(island.getAttribute('data-exact-client-hydration')).toBe('eager');
	expect(island.hasAttribute('data-xh')).toBe(false);
	expect(context.hydrationTable?.value()).toBeUndefined();
});

it('rejects nonserializable descendant state before publishing an island', () => {
	expect(() =>
		publishClientBoundary(createSsrContext({}), 'Parent', 'parent', {}, 'eager', true, '', [
			['child', [[0, () => 42]]]
		])
	).toThrow(/serializ/);
});

it('keeps empty descendant captures in the compact prop table', () => {
	const context = createSsrContext({});
	const html = publishClientBoundary(context, 'Empty', 'empty', {}, 'eager', true, '', []);
	expect(html).toContain('data-xh="0.0"');
	expect(context.hydrationTable?.value()).toBeDefined();
});
