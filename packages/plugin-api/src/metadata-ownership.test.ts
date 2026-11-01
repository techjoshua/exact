import { expect, it } from 'vitest';
import {
	verifyPluginMetadataValues,
	verifyPluginMetadataCapture
} from '../../component-composition-corpus/test-support/plugin-metadata-journey.mjs';
import { readExactPackageParticipation } from './manifest.js';
import { resolveDiscoveryPolicy } from '../../plugin-host/src/discovery/policy.js';

it('returns ordinary metadata and policy observations with independent source values', () => {
	expect(
		verifyPluginMetadataValues({ readExactPackageParticipation, resolveDiscoveryPolicy })
	).toBe(true);
});
it('publishes captured, validated forwarding choices and trust selectors', () => {
	expect(
		verifyPluginMetadataCapture({ readExactPackageParticipation, resolveDiscoveryPolicy })
	).toBe(true);
});

it('validates captured selectors without delegating parsing to a caller map method', () => {
	const selectors = Object.assign(['@safe/'], { map: () => ['../invalid'] });
	const value = readExactPackageParticipation({
		exact: { pluginForwarding: { schemaVersion: 1, include: {}, ignore: selectors } }
	});
	expect(value.forwarding?.ignore).toEqual(['@safe/']);
});

it('captures trust prefix getters before validating the published policy', () => {
	let reads = 0;
	const value = resolveDiscoveryPolicy({
		mode: 'trusted',
		includeDefaultTrustedPrefixes: false,
		get trustedPrefixes() {
			return ++reads <= 2 ? ['@acme/'] : [''];
		}
	});
	expect(reads).toBe(1);
	expect(value.trustedPrefixes).toEqual(['@acme/']);
});
