/** @vitest-environment jsdom */
import { it, expect, onTestFinished } from 'vitest';
import {
	createExactClient,
	defineExactHydrationRegistration,
	readExactHydrationConfig
} from './index.js';
import {
	captureArraySubmission,
	parseArrayNetMutation,
	prepareArrayNetMutation,
	applyArrayNetPlan
} from '@exactjs/reactive/framework/array-patch';
const binding = {
	capture: captureArraySubmission,
	parse: parseArrayNetMutation,
	plan: prepareArrayNetMutation,
	apply: applyArrayNetPlan
};
it('copies normalized executable registrations without serializing callbacks into document configuration', () => {
	const input = { continuationArrays: { first: binding, second: { ...binding, apply: () => {} } } };
	const registration = defineExactHydrationRegistration(input);
	expect(registration.continuationArrays).not.toBe(input.continuationArrays);
	expect(registration.continuationArrays?.first).toBe(binding);
	expect(registration.continuationArrays?.second).toBe(input.continuationArrays.second);
	const script = document.createElement('script');
	script.id = '__exact_hydration';
	script.type = 'application/json';
	script.textContent = JSON.stringify({
		endpoint: '/must-not-register',
		continuationArrays: input.continuationArrays
	});
	document.body.append(script);
	onTestFinished(() => script.remove());
	expect(readExactHydrationConfig()).toEqual({});
});
it.each([
	{ ...binding, capture: undefined },
	{ ...binding, parse: null },
	{ ...binding, plan: false },
	{ ...binding, apply: 'invalid' },
	{ ...binding, extra: () => {} }
])(
	'rejects malformed executable registration through initial, normalized and late paths',
	(invalid) => {
		const continuationArrays = { first: invalid } as never;
		expect(() => defineExactHydrationRegistration({ continuationArrays })).toThrow(
			'Invalid eXact Array client binding'
		);
		const container = document.createElement('main');
		expect(() => createExactClient(container, { continuationArrays })).toThrow(
			'Invalid eXact Array client binding'
		);
		const client = createExactClient(container);
		onTestFinished(() => client.dispose());
		expect(() => client.registerComponents({ continuationArrays })).toThrow(
			'Invalid eXact Array client binding'
		);
	}
);
