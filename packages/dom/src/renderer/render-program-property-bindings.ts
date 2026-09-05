import type {
	ExactRenderProgramBindingTarget,
	ExactRenderProgramPropertyOperand,
	ExactRenderProgramWiring
} from '@exactjs/core/runtime/render-operations';
import { applyCompiledProps } from '../compiled-props.js';
import {
	retainProgramBinding,
	type ProgramBindingTarget
} from './render-program-retained-binding.js';

/** Binds one compiler-written property group to its exact target slot. */
export function bindCompiledProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	firstSlot: number,
	direct?: true,
	operands?: readonly ExactRenderProgramPropertyOperand[]
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[firstSlot] as Element;
	if ((!state.invocation.propertyWriter && !operands) || !element) {
		context.valid = false;
		return;
	}
	const apply = () =>
		applyCompiledProps(context.mounted, element, group, context.initialBinding, operands);
	if (direct) apply();
	else retainProgramBinding(context, apply);
}

/** Binds one compiler-selected arbitrary-JavaScript property reader as a focused reactive update. */
export function bindCompiledReactiveProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	firstSlot: number
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[firstSlot] as Element;
	if (!state.invocation.propertyWriter || !element) {
		context.valid = false;
		return;
	}
	retainProgramBinding(context, () =>
		applyCompiledProps(context.mounted, element, group, context.initialBinding)
	);
}

/** Applies one compiler-selected property group without installing a dynamic watcher. */
export function applyCompiledProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	firstSlot: number
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[firstSlot];
	let operands: readonly ExactRenderProgramPropertyOperand[] | undefined;
	const wire = (state.invocation.program as Readonly<{ wire?: ExactRenderProgramWiring }>).wire;
	for (const operation of wire?.[2] ?? []) {
		if (operation[0] !== 12 || operation[1] !== group || operation[2] !== firstSlot) continue;
		operands = operation[3] as readonly ExactRenderProgramPropertyOperand[];
		break;
	}
	if (!(element instanceof Element) || (!state.invocation.propertyWriter && !operands)) {
		context.valid = false;
		return;
	}
	applyCompiledProps(context.mounted, element, group, false, operands);
}
