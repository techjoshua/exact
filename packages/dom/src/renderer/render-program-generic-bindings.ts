import type {
	ExactRenderProgramBinder,
	ExactRenderProgramBinding,
	ExactRenderProgramSlot
} from '@exactjs/core/runtime/render-operations';
import {
	bindCompiledProgramChild,
	bindCompiledProgramLists,
	bindCompiledProgramText,
	bindCompatibleProgramProperties
} from './render-program-bindings.js';

/** Builds the table-driven compatibility binder used only by explicit testing/support artifacts. */
export function createGenericRenderProgramBinder(
	bindings: readonly ExactRenderProgramBinding[],
	slots: readonly ExactRenderProgramSlot[]
): ExactRenderProgramBinder {
	return (target) => {
		let propertyGroup = 0;
		for (const binding of bindings) {
			if (binding[0] === 'lists') {
				bindCompiledProgramLists(target, binding[1]);
				continue;
			}
			if (binding[0] === 'child' || binding[0] === 'component') {
				bindCompiledProgramChild(target, binding[1]);
				continue;
			}
			if (binding[0] === 'text') {
				const slot = slots[binding[1]];
				bindCompiledProgramText(
					target,
					binding[1],
					undefined,
					undefined,
					slot?.[0] === 'text' ? (slot[4] ?? '') : '',
					slot?.[0] === 'text' ? (slot[5] ?? '') : ''
				);
				continue;
			}
			bindCompatibleProgramProperties(target, propertyGroup++, binding[1], slots);
		}
	};
}
