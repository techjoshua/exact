import { expect, it } from 'vitest';
import { mergeInspectionRedactions } from './redactions.js';

it('unions sorted string selectors while preserving structured context rules and caller ownership', () => {
	const first = Object.freeze({
		statePaths: Object.freeze(['state.z', 'state.a']),
		secretNames: Object.freeze(['TOKEN', 'KEY']),
		contextTokens: Object.freeze([
			{ name: 'auth', scope: 'request' as const, kind: 'secret' as const }
		])
	});
	const second = Object.freeze({
		statePaths: Object.freeze(['state.a']),
		secretNames: Object.freeze(['TOKEN']),
		contextTokens: Object.freeze([
			{ name: 'auth', scope: 'application' as const, kind: 'server-resource' as const }
		])
	});
	const configured = Object.freeze({
		statePaths: Object.freeze(['state.m']),
		secretNames: Object.freeze(['API']),
		contextTokens: Object.freeze([first.contextTokens[0]!])
	});
	const merged = mergeInspectionRedactions([first, second], configured);
	expect(merged).toEqual({
		statePaths: ['state.a', 'state.m', 'state.z'],
		secretNames: ['API', 'KEY', 'TOKEN'],
		contextTokens: [...first.contextTokens, ...second.contextTokens, ...configured.contextTokens]
	});
	expect(mergeInspectionRedactions([])).toEqual({
		statePaths: [],
		secretNames: [],
		contextTokens: []
	});
	expect(merged.contextTokens[0]).toBe(first.contextTokens[0]);
	expect(first.statePaths).toEqual(['state.z', 'state.a']);
});
