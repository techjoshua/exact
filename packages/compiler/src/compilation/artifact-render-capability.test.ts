import { expect, it } from 'vitest';
import type { TransformResult } from '../types.js';
import {
	readExactArtifactComponentFacts,
	retainArtifactComponentFacts
} from './artifact-component-facts.js';

const marker = '// exact:component-build/1 ';
function artifact(renderCapability?: unknown): string {
	return (
		marker +
		Buffer.from(
			JSON.stringify({
				protocol: 1,
				components: [
					{
						id: 'view',
						placement: 'isomorphic',
						artifactTargets: ['server', 'client'],
						...(renderCapability === undefined ? {} : { renderCapability })
					}
				],
				componentImports: [],
				rendererEnhancements: []
			})
		).toString('base64url')
	);
}

it('keeps old coordinated facts unknown and preserves explicit rendering facts', () => {
	expect(
		readExactArtifactComponentFacts(artifact(), '/view.js')?.components[0]?.renderCapability
	).toEqual({ server: 'unknown', client: 'unknown' });
	const capability = { server: 'supported', client: 'unknown' };
	expect(
		readExactArtifactComponentFacts(artifact(capability), '/view.js')?.components[0]
			?.renderCapability
	).toEqual(capability);
});

it.each([
	null,
	'isomorphic',
	{},
	{ server: 'supported' },
	{ server: 'supported', client: 'neutral' },
	{ server: 'supported', client: 'supported', publication: true },
	{ server: true, client: 'unknown' }
])('rejects malformed present render capability %j', (capability) => {
	expect(() => readExactArtifactComponentFacts(artifact(capability), '/view.js')).toThrow(
		/Invalid artifact/
	);
});

it('retains component-only facts without adding executable authority', () => {
	const facts = readExactArtifactComponentFacts(
		artifact({ server: 'supported', client: 'unsupported' }),
		'/view.js'
	)!;
	const result = {
		code: 'export function View() {}',
		map: undefined,
		componentBuild: facts
	} as TransformResult;
	const retained = retainArtifactComponentFacts(result);
	expect(retained.code.startsWith(result.code)).toBe(true);
	expect(retained.map).toBe(result.map);
	expect(readExactArtifactComponentFacts(retained.code, '/retained.js')?.components).toEqual(
		facts.components
	);
	expect(retained.code.slice(0, result.code.length)).toBe(result.code);
});
