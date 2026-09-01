/** @vitest-environment jsdom */
import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import { type Component } from '@exactjs/core';
import {
	createPreparedRenderProgram,
	prepareCompiledRenderProgram as prepareCoreRenderProgram
} from '@exactjs/core/runtime/render';
import { expect, it } from 'vitest';
import { adoptStatic } from './test-support/adoption.js';
import { withGenericRenderProgramBindings } from './testing.js';
import { createCompiledOperation } from './test-support/native-operations.js';

function RenderProgramOwner(this: Component<{}>) {
	return () => null;
}
const renderProgramOwner = createFrameworkFixtureComponentInstance(RenderProgramOwner, {});

it('rejects a marked SSR program when its generated hydration claims do not match the DOM', () => {
	const program = prepareCoreRenderProgram(
		withGenericRenderProgramBindings({
			version: 7,
			id: 'render-program:invalid-hydration-plan',
			namespace: 'html',
			template:
				'<section data-exact-id="root"><button data-exact-id="button">Save</button></section>',
			slots: [],
			bindings: [],
			nodes: [
				[0, 'section'],
				[1, 'a']
			]
		})
	);
	const vnode = createPreparedRenderProgram(program, [], renderProgramOwner, () =>
		createCompiledOperation('section', {}, createCompiledOperation('button', {}, 'Save'))
	);
	const container = document.createElement('div');
	container.innerHTML =
		'<!--exact:dynamic:test-root--><!--exact:cell:root--><section data-exact-id="root"><!--exact:cell:button--><button data-exact-id="button">Save</button><!--/exact:cell:button--></section><!--/exact:cell:root--><!--/exact:dynamic:test-root-->';

	expect(adoptStatic(vnode, container)).toBe(false);
});
