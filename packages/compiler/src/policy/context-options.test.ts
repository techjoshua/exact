import { describe, expect, it } from 'vitest';
import { parseContextPolicyOptions } from './context-options.js';

describe('context residency options', () => {
	it('accepts the closed explicit residency vocabulary', () => {
		expect(parseContextPolicyOptions(`{ keep: 'server' }`)).toEqual({ keep: 'server' });
		expect(parseContextPolicyOptions(`{ keep: "client" }`)).toEqual({ keep: 'client' });
		expect(parseContextPolicyOptions(`{ keep: "shared" }`)).toEqual({ keep: 'shared' });
		expect(parseContextPolicyOptions(`{ keep: 'secret' }`)).toEqual({ keep: 'secret' });
		expect(parseContextPolicyOptions(`{ scope: 'request' }`)).toEqual({ scope: 'request' });
		expect(parseContextPolicyOptions(`{ scope: 'application', keep: 'shared' }`)).toEqual({
			keep: 'shared',
			scope: 'application'
		});
	});

	it('rejects dynamic, inferred-only, and unknown residency values', () => {
		expect(parseContextPolicyOptions('{ keep: residency }').error).toContain('static string');
		expect(parseContextPolicyOptions(`{ keep: 'isomorphic' }`).error).toContain('unknown');
		expect(parseContextPolicyOptions(`{ keep: 'device' }`).error).toContain('unknown');
	});

	it('ignores option objects without a keep property', () => {
		expect(parseContextPolicyOptions('{ defaultValue: null }')).toEqual({});
	});
});
