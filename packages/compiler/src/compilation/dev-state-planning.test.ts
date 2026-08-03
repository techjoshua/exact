import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactArtifactGraphInput } from '../types.js';
import { affectedArtifactInputs } from './dev-state-planning.js';

describe('artifact dev-state planning', () => {
	it('includes direct changes and artifacts that depend on them', () => {
		const root = path.resolve('project');
		const dependency = path.join(root, 'dependency.ts');
		const consumer = path.join(root, 'consumer.ts');
		const entry = artifactEntry(consumer, ['./dependency.ts']);

		expect(new Set(affectedArtifactInputs([entry], [dependency]))).toEqual(
			new Set([dependency, consumer])
		);
	});

	it('does not recompile artifacts unrelated to a change', () => {
		const changed = path.resolve('project/changed.ts');
		const entry = artifactEntry(path.resolve('project/consumer.ts'), ['./other.ts']);

		expect(affectedArtifactInputs([entry], [changed])).toEqual([changed]);
	});
});

function artifactEntry(inputFile: string, dependencies: string[]): ExactArtifactGraphInput {
	return {
		inputFile,
		clientFile: `${inputFile}.client.js`,
		serverFile: `${inputFile}.server.js`,
		build: {
			dependencies,
			componentIds: [],
			exposureRoots: [],
			componentEdges: [],
			clientRegistrations: [],
			serverRegistrations: [],
			operations: [],
			boundaries: [],
			partitionPlan: { version: 1, buildKey: 'fixture', roots: [], nodes: [], edges: [] }
		}
	};
}
