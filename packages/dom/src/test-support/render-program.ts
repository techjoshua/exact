import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import type { Component } from '@exactjs/core';
import {
	createPreparedRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/runtime/render';
import { withGenericRenderProgramBindings } from '../testing.js';

function RenderProgramOwner(this: Component<{}>) {
	return () => null;
}

const owner = createFrameworkFixtureComponentInstance(RenderProgramOwner, {});

/** Joins a prepared test descriptor to readers with a stable compiler-shaped owner. */
export function createTestPreparedRenderProgram(
	program: Parameters<typeof createPreparedRenderProgram>[0],
	readers: Parameters<typeof createPreparedRenderProgram>[1],
	propertyWriter?: Parameters<typeof createPreparedRenderProgram>[3]
) {
	return createPreparedRenderProgram(program, readers, owner, propertyWriter);
}

/** Creates a compiler-shaped render-program invocation for low-level renderer tests. */
export function createTestCompiledRenderProgram(
	_cacheKey: string,
	createProgram: () => Parameters<typeof prepareCompiledRenderProgram>[0],
	readers: Parameters<typeof createPreparedRenderProgram>[1],
	_fallback?: () => unknown
) {
	void _fallback;
	return createPreparedRenderProgram(
		prepareCompiledRenderProgram(withGenericRenderProgramBindings(createProgram())),
		readers,
		owner
	);
}
