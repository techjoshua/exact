import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('@exactjs/core root API', () => {
	it('does not expose compiler and renderer construction capabilities', () => {
		for (const name of [
			'RenderProgram',
			'createCompiledComponentRegistry',
			'createCompiledVNode',
			'createComponentInstance',
			'exactComponentContract',
			'createExactFrameworkFixtureArtifact',
			'renderInstance'
		]) {
			expect(core).not.toHaveProperty(name);
		}
	});
});
