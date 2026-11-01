import { readServerComponentReference } from './server-component-reference.js';
import { expect, it, vi } from 'vitest';
import { createPreparedServerComponentInputReference } from '@exactjs/core/framework/server-render-structure';
import { StaticServerLeaf } from './static-server-programs.fixtures.test.js';
import { consumeScalarPropsProof, markScalarPropsProof } from './scalar-props-proof.js';
it('shares consumption and attempted issuance across runtime copies', async () => {
	vi.resetModules();
	const other = await import('./scalar-props-proof.js');
	const props = { title: 'ready' };
	const invocation = {};
	const first = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	markScalarPropsProof(first, props, invocation, 'title');
	expect(other.consumeScalarPropsProof(readServerComponentReference(first)!, props)).toBe(true);
	expect(consumeScalarPropsProof(readServerComponentReference(first)!, props)).toBe(false);
	const repeated = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	other.markScalarPropsProof(repeated, props, invocation, 'title');
	expect(other.consumeScalarPropsProof(readServerComponentReference(repeated)!, props)).toBe(false);
});
it('consumes a scalar proof once without marking the authored input', () => {
	const props = { title: 'ready' };
	const reference = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	markScalarPropsProof(reference, props, {}, 'title');
	expect(Reflect.ownKeys(props)).toEqual(['title']);
	expect(consumeScalarPropsProof(readServerComponentReference(reference)!, props)).toBe(true);
	expect(consumeScalarPropsProof(readServerComponentReference(reference)!, props)).toBe(false);
});
it('invalidates the proof when normalization or later preparation replaces the bag', () => {
	const keyed = { title: 'ready', key: 'item' };
	const normalized = createPreparedServerComponentInputReference(StaticServerLeaf, keyed);
	markScalarPropsProof(normalized, keyed, {}, 'title');
	expect(
		consumeScalarPropsProof(
			readServerComponentReference(normalized)!,
			readServerComponentReference(normalized)!.props
		)
	).toBe(false);
	const props = { title: 'ready' };
	const reference = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	markScalarPropsProof(reference, props, {}, 'title');
	expect(consumeScalarPropsProof(readServerComponentReference(reference)!, { ...props })).toBe(
		false
	);
	expect(consumeScalarPropsProof(readServerComponentReference(reference)!, props)).toBe(false);
});
it('keeps proofs local to each issued reference', () => {
	const props = { title: 'ready' };
	const first = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	const second = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	markScalarPropsProof(first, props, {}, 'title');
	expect(consumeScalarPropsProof(readServerComponentReference(second)!, props)).toBe(false);
	expect(consumeScalarPropsProof(readServerComponentReference(first)!, props)).toBe(true);
});
it('rejects potentially exposed inputs without allowing a later proof attempt', () => {
	const props = { title: 'ready' };
	const invocation = {};
	const reference = createPreparedServerComponentInputReference(StaticServerLeaf, props);
	markScalarPropsProof(reference, props, invocation, 'title', false);
	expect(consumeScalarPropsProof(readServerComponentReference(reference)!, props)).toBe(false);
	markScalarPropsProof(reference, props, invocation, 'title', true);
	expect(consumeScalarPropsProof(readServerComponentReference(reference)!, props)).toBe(false);
});
it.each([false, true])(
	'does not reissue a proof after a prior attempt with proven=%s',
	(proven) => {
		const props: {
			title: unknown;
		} = { title: proven ? 'ready' : {} };
		const invocation = {};
		const first = createPreparedServerComponentInputReference(StaticServerLeaf, props);
		markScalarPropsProof(first, props, invocation, 'title');
		expect(consumeScalarPropsProof(readServerComponentReference(first)!, props)).toBe(proven);
		let reads = 0;
		Object.defineProperty(props, 'title', {
			enumerable: true,
			get() {
				reads++;
				return 'changed';
			}
		});
		const repeated = createPreparedServerComponentInputReference(StaticServerLeaf, props);
		markScalarPropsProof(repeated, props, invocation, 'title');
		expect(consumeScalarPropsProof(readServerComponentReference(repeated)!, props)).toBe(false);
		expect(reads).toBe(0);
	}
);
