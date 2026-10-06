import type { Mounted } from '../types.js';
import { directProgram } from './render-program-operation.js';
import { readProgramTemplateRootProps } from './render-program-template.js';

/**
 * Recovers authored root attributes from compiler-owned source, independently of SSR target layers.
 * Invocation-local property groups are applied afterward so hydrated contributions stay mutable.
 */
export function authoredRenderProgramProps(
	program: NonNullable<Mounted['renderProgram']>
): Record<string, unknown> {
	const root = program.programRoot;
	if (!(root instanceof Element))
		throw new TypeError('A semantic intrinsic render-program root must be an element');
	const props = {
		...readProgramTemplateRootProps(
			directProgram(program.invocation.program),
			root.ownerDocument,
			root.parentNode ?? undefined
		)
	};
	Object.assign(props, program.props?.get(root));
	for (const group of program.compiledProps ?? []) {
		if (group?.element === root) Object.assign(props, group.values);
	}
	return props;
}
