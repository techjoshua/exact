/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import { createEnhancementNode } from '@exactjs/core';
import {
	createPreparedRenderProgram,
	prepareCompiledRenderProgram,
	type ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { legacyTestRenderProgram, renderTestTree as render } from './testing.js';
import {
	applyCompiledProgramText,
	beginCompiledProgramClaims,
	bindCompiledProgramText,
	bindCompiledStateComponentUpdate,
	claimCompiledProgramText
} from './runtime/render-program.js';
import { ProgramEnhancementProvider } from './native-enhancement.fixtures.js';

it('keeps compiled updates owned when the render program is the direct enhancement target', () => {
	const identity = '@test/direct-program-enhancement-owner';
	const updates = {
		bindings: [[0, 1, 0]] as const,
		apply(targets: readonly (object | undefined)[], dirtyLow: number) {
			if ((dirtyLow & 1) !== 0 && targets[0])
				applyCompiledProgramText(targets[0] as ExactRenderProgramBindingTarget, 0);
		}
	};
	const program = prepareCompiledRenderProgram(
		legacyTestRenderProgram({
			version: 8,
			id: identity,
			namespace: 'html',
			template: '<output><!---->\ue000exact:0\ue001<!----></output>',
			directClaims: true,
			bind(target) {
				if (beginCompiledProgramClaims(target, 'output', 'html', 1, 1)) {
					claimCompiledProgramText(target, 0, 0, true);
					return;
				}
				bindCompiledProgramText(target, 0, true);
				bindCompiledStateComponentUpdate(target, 0, updates);
			}
		})
	);
	const ownerScope = createEffectScope();
	const state = indexedReactiveObjects<{ count: number }>(['count']);
	state.count = 0;
	const owner = { state, scope: ownerScope };
	const container = document.createElement('div');

	render(
		createPreparedRenderProgram(
			program,
			[() => state.count],
			owner,
			undefined,
			createEnhancementNode([{ identity, props: {} }])
		),
		container,
		{ enhancementCatalog: new Map([[identity, ProgramEnhancementProvider]]) }
	);
	expect(container.querySelector('output')?.textContent).toBe('0');

	state.count = 1;
	flushSync();
	expect(container.querySelector('output')?.textContent).toBe('1');
	ownerScope.stop();
});
