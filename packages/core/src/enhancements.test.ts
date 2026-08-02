import { describe, expect, it } from 'vitest';
import { createEnhancementMarker, omitKnownProps } from './enhancements.js';
import { createVNode } from './vnode.js';

describe('renderer enhancement markers', () => {
	it('groups canonical entries outside authored props', () => {
		const marker = createEnhancementMarker([
			{ identity: '@exactjs/motion#motion', props: { preset: 'fade' } },
			{ identity: '@exactjs/gestures#gestures', props: { draggable: true }, root: true }
		]);
		const vnode = createVNode('button', {
			id: 'save',
			__exactEnhancements: marker
		});

		expect(vnode.props).toEqual({ id: 'save' });
		expect(vnode.enhancements).toBe(marker);
		expect(marker.entries).toEqual([
			{ identity: '@exactjs/motion#motion', props: { preset: 'fade' } },
			{ identity: '@exactjs/gestures#gestures', props: { draggable: true }, root: true }
		]);
	});

	it('rejects duplicate canonical identities at one boundary', () => {
		expect(() =>
			createEnhancementMarker([
				{ identity: 'plugin#value', props: {} },
				{ identity: 'plugin#value', props: {} }
			])
		).toThrow('Duplicate enhancement identity');
	});

	it('omits only compiler-proven keys without changing the source object', () => {
		const source = { id: 'card', 'motion:apply': 'fade', title: 'Card' };
		expect(omitKnownProps(source, ['motion:apply'])).toEqual({ id: 'card', title: 'Card' });
		expect(source['motion:apply']).toBe('fade');
	});
});
