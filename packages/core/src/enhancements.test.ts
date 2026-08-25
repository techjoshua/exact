import { describe, expect, it } from 'vitest';
import { createContext } from './keys.js';
import { createExactFrameworkFixtureArtifact } from './component-contracts.js';
import {
	createEnhancementNode,
	markExactEnhancementContexts,
	omitKnownProps,
	readExactEnhancementContexts
} from './enhancements.js';
import { createVNode } from './vnode.js';

describe('renderer enhancement markers', () => {
	it('groups canonical entries outside authored props', () => {
		const marker = createEnhancementNode([
			{ identity: '@exactjs/motion#motion', props: { preset: 'fade' } },
			{ identity: '@exactjs/gestures#gestures', props: { draggable: true }, root: true }
		]);
		const vnode = createVNode('button', {
			id: 'save',
			__exactEnhancements: marker
		});

		expect(vnode.props).toEqual({ id: 'save' });
		expect(vnode.enhancement).toBe(marker);
		expect(marker).toMatchObject({ kind: 'enhancement', fallback: 'preserve-target' });
		expect(marker.entries).toEqual([
			{ identity: '@exactjs/motion#motion', props: { preset: 'fade' } },
			{ identity: '@exactjs/gestures#gestures', props: { draggable: true }, root: true }
		]);
	});

	it('rejects duplicate canonical identities at one boundary', () => {
		expect(() =>
			createEnhancementNode([
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

	it('carries explicit runtime context effects by token identity', () => {
		const token = createContext<string>('enhancement-test', true);
		const component = markExactEnhancementContexts(
			createExactFrameworkFixtureArtifact(function Test() {
				return () => null;
			}, 'test:enhancement-contexts'),
			{ provides: [token] }
		);
		expect(readExactEnhancementContexts(component)).toEqual({ provides: [token.id] });
	});
});
