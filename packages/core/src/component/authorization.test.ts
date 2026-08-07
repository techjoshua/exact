import { describe, expect, it } from 'vitest';
import {
	isExactComponentAuthorizationIdentity,
	sameExactComponentAuthorization
} from './authorization.js';

describe('component authorization identity', () => {
	const identity = Object.freeze({
		protocol: 1 as const,
		buildKey: 'build-one',
		fingerprint: 'authorization_one'
	});

	it('accepts only the compact header-safe runtime shape', () => {
		expect(isExactComponentAuthorizationIdentity(identity)).toBe(true);
		expect(isExactComponentAuthorizationIdentity({ ...identity, packages: [] })).toBe(false);
		expect(
			isExactComponentAuthorizationIdentity({
				...identity,
				fingerprint: 'authorization\r\nX-Injected: yes'
			})
		).toBe(false);
	});

	it('compares protocol, build, and fingerprint together', () => {
		expect(sameExactComponentAuthorization(identity, { ...identity })).toBe(true);
		expect(
			sameExactComponentAuthorization(identity, {
				...identity,
				fingerprint: 'authorization_two'
			})
		).toBe(false);
	});
});
