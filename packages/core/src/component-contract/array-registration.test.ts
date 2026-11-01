import { assertArrayCompletionVersion } from '../framework/server-task-helpers.js';
import { assertComponentInputVersion } from '../component-abi/receipt.js';
import { componentContractVersion } from '../component/contract-versions.js';
import { it, expect } from 'vitest';
import { addUniqueArrayClientBinding } from './composition-support.js';
import {
	captureArraySubmission,
	parseArrayNetMutation,
	prepareArrayNetMutation,
	applyArrayNetPlan,
	type ArrayClientBinding
} from '@exactjs/reactive/framework/array-patch';
it('keeps duplicate registration and rejects differing callbacks for the same continuation', () => {
	const binding = {
			capture: captureArraySubmission,
			parse: parseArrayNetMutation,
			plan: prepareArrayNetMutation,
			apply: applyArrayNetPlan
		},
		map: Record<string, ArrayClientBinding> = {};
	addUniqueArrayClientBinding(map, 'first', binding);
	addUniqueArrayClientBinding(map, 'first', binding);
	addUniqueArrayClientBinding(map, 'second', { ...binding, apply: () => {} });
	expect(() => addUniqueArrayClientBinding(map, 'first', { ...binding, apply: () => {} })).toThrow(
		'Conflicting'
	);
	expect(map.first).toBe(binding);
});

it('admits Array completion4 before work independently of component input5', () => {
	expect(componentContractVersion).toBe(6);
	expect(() => assertComponentInputVersion(componentContractVersion)).not.toThrow();
	expect(() => assertComponentInputVersion(4)).toThrow(TypeError);
	let work = 0;
	const result = {};
	const invoke = () => {
		assertArrayCompletionVersion(4);
		work++;
		return result;
	};
	expect(invoke()).toBe(result);
	expect(work).toBe(1);
});

it.each([3, 5, NaN, Infinity])('rejects Array completion %s before work', (version) => {
	let work = 0;
	const invoke = () => {
		assertArrayCompletionVersion(version);
		work++;
	};
	expect(invoke).toThrow(
		new TypeError('Unsupported Array completion ABI. Rebuild matching eXact providers.')
	);
	expect(work).toBe(0);
});
