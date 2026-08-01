import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactArtifactGraphEntry } from '../types.js';
import { affectedArtifactInputs } from './dev-state-planning.js';

describe('artifact dev-state planning', () => {
	it('includes direct changes and artifacts that depend on them', () => {
		const root = path.resolve('project');
		const dependency = path.join(root, 'dependency.ts');
		const consumer = path.join(root, 'consumer.ts');
		const entry = {
			inputFile: consumer,
			analysis: {
				filename: consumer,
				dependencies: ['./dependency.ts']
			}
		} as ExactArtifactGraphEntry;

		expect(new Set(affectedArtifactInputs([entry], [dependency]))).toEqual(
			new Set([dependency, consumer])
		);
	});

	it('does not recompile artifacts unrelated to a change', () => {
		const changed = path.resolve('project/changed.ts');
		const entry = {
			inputFile: path.resolve('project/consumer.ts'),
			analysis: {
				filename: path.resolve('project/consumer.ts'),
				dependencies: ['./other.ts']
			}
		} as ExactArtifactGraphEntry;

		expect(affectedArtifactInputs([entry], [changed])).toEqual([changed]);
	});
});
