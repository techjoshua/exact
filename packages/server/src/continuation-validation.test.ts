import { describe, expect, it } from 'vitest';
import type { ExactStatePath } from './types.js';
import {
	collectionMutationsMatchContract,
	contextResponseMatchesContract,
	publicContextMatchesContract,
	stateMatchesContract,
	stateResponseMatchesContract
} from './validation.js';

describe('continuation authorization', () => {
	it('requires exact reads through own object properties and canonical array indices', () => {
		const reads: ExactStatePath[] = [{ path: 'rows.0.id', kind: 'read', confidence: 'exact' }];
		expect(stateMatchesContract({ rows: [{ id: 1 }] }, reads)).toBe(true);
		for (const state of [undefined, null, {}, { rows: [] }, { rows: [null] }]) {
			expect(stateMatchesContract(state, reads)).toBe(false);
		}
		const inherited = Object.create({ id: 1 });
		expect(stateMatchesContract({ rows: [inherited] }, reads)).toBe(false);
		for (const path of ['rows.00.id', 'rows.-1.id', 'rows.length', 'constructor', '__proto__']) {
			expect(stateMatchesContract({ rows: [{ id: 1 }] }, [{ ...reads[0]!, path }])).toBe(false);
		}
		expect(stateMatchesContract({}, [{ ...reads[0]!, kind: 'write' }])).toBe(true);
		expect(stateMatchesContract({}, [{ ...reads[0]!, confidence: 'broad' }])).toBe(true);
		expect(stateMatchesContract({}, [{ ...reads[0]!, confidence: 'unknown' }])).toBe(true);
		expect(stateMatchesContract(null, [{ ...reads[0]!, path: '*' }])).toBe(true);
		expect(stateMatchesContract(undefined, [{ ...reads[0]!, path: '*' }])).toBe(false);
	});

	it('permits skipped writes and whole authorized subtrees while rejecting additional writes', () => {
		const writes: ExactStatePath[] = [{ path: 'project.name', kind: 'write', confidence: 'exact' }];
		for (const state of [undefined, {}, { project: { name: 'updated' } }]) {
			expect(stateResponseMatchesContract(state, writes)).toBe(true);
		}
		for (const state of [null, 1, [], { other: 1 }, { project: { name: 'updated', secret: 1 } }]) {
			expect(stateResponseMatchesContract(state, writes)).toBe(false);
		}
		const subtree = { project: { name: 'updated', rows: [{ id: 1 }] } };
		expect(stateResponseMatchesContract(subtree, [{ ...writes[0]!, path: 'project' }])).toBe(true);
		for (const write of [
			{ ...writes[0]!, kind: 'read' as const },
			{ ...writes[0]!, confidence: 'broad' as const },
			{ ...writes[0]!, confidence: 'unknown' as const }
		]) {
			expect(stateResponseMatchesContract({ project: { name: 'updated' } }, [write])).toBe(false);
		}
		expect(stateResponseMatchesContract(subtree, [{ ...writes[0]!, path: '*' }])).toBe(true);
	});

	it('binds collection deltas to the exact path and collection kind', () => {
		const mapWrite: ExactStatePath = {
			path: 'items',
			kind: 'write',
			confidence: 'exact',
			operation: 'map'
		};
		const mutation = { path: 'items', operation: 'map-clear' as const };
		expect(collectionMutationsMatchContract(undefined, [])).toBe(true);
		expect(collectionMutationsMatchContract([], [])).toBe(true);
		expect(collectionMutationsMatchContract([mutation], [mapWrite])).toBe(true);
		for (const write of [
			{ ...mapWrite, kind: 'read' as const },
			{ ...mapWrite, confidence: 'broad' as const },
			{ ...mapWrite, confidence: 'unknown' as const },
			{ ...mapWrite, operation: 'value' as const },
			{ ...mapWrite, operation: 'set' as const },
			{ ...mapWrite, path: 'other' }
		]) {
			expect(collectionMutationsMatchContract([mutation], [write])).toBe(false);
		}
		expect(collectionMutationsMatchContract([mutation], [])).toBe(false);
		expect(
			collectionMutationsMatchContract(
				[{ path: 'items', operation: 'set-add', value: 1 }],
				[{ ...mapWrite, operation: 'set' }]
			)
		).toBe(true);
	});

	it('requires all public context reads but allows a subset of authorized writes', () => {
		expect(publicContextMatchesContract(undefined, [])).toBe(true);
		expect(publicContextMatchesContract(undefined, ['theme'])).toBe(false);
		expect(publicContextMatchesContract({}, [])).toBe(false);
		expect(publicContextMatchesContract({ theme: 'dark' }, ['theme'])).toBe(true);
		expect(publicContextMatchesContract({}, ['theme'])).toBe(false);
		expect(publicContextMatchesContract(Object.create({ theme: 'dark' }), ['theme'])).toBe(false);
		expect(publicContextMatchesContract({ theme: 'dark', secret: 1 }, ['theme'])).toBe(false);
		expect(contextResponseMatchesContract(undefined, ['theme'])).toBe(true);
		expect(contextResponseMatchesContract({}, ['theme'])).toBe(true);
		expect(contextResponseMatchesContract({ theme: 'dark' }, ['theme'])).toBe(true);
		expect(contextResponseMatchesContract({ theme: 'dark', secret: 1 }, ['theme'])).toBe(false);
	});
});
