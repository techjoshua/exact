import type { BoundModule } from '@exactjs/expressions';
import { normalizeTaskFacetNames } from '../calls.js';
import type { ExactStateEffect } from '../types.js';
import type { expressionComponentIndex } from './component-index.js';
import type { analyzeExpressionWrites } from './writes.js';
import { effect, expressionTaskFacets, taskComponentOwner } from './task-state.js';

type TaskReference = Parameters<typeof expressionTaskFacets>[0];
type ComponentIndex = ReturnType<typeof expressionComponentIndex>;
type WriteAnalysis = ReturnType<typeof analyzeExpressionWrites>;

/** Analyzes value-bearing task syntax and records its deterministic-lowering constraints. */
export function analyzeAwaitedTask(
	task: TaskReference,
	taskWrites: ExactStateEffect[],
	writes: WriteAnalysis,
	components: ComponentIndex,
	awaitedTasksByComponent: Map<string, number>,
	compilerOwnedAwaits: Set<string>
) {
	const taskPolicy = normalizeTaskFacetNames(expressionTaskFacets(task));
	const awaited = task.parent?.node.kind === 'AwaitExpression';
	if (awaited && task.parent) compilerOwnedAwaits.add(task.parent.node.id);
	const awaitedAssignment = awaited ? task.parent?.parent : undefined;
	const componentOwner = taskComponentOwner(task, components);
	let awaitedAssignmentWriteCount = 0;
	if (awaitedAssignment?.node.kind === 'BinaryExpression' && awaitedAssignment.node.span) {
		for (const site of writes.sites.values()) {
			if (
				site.start >= awaitedAssignment.node.span.start &&
				site.end <= awaitedAssignment.node.span.end
			) {
				awaitedAssignmentWriteCount++;
				taskWrites.push(effect(site.path.join('.'), 'write', site.operation === 'array-mutation'));
			}
		}
	}
	const diagnostics = [...taskPolicy.diagnostics];
	if (awaited) {
		const directAssignment =
			awaitedAssignment?.node.kind === 'BinaryExpression' &&
			awaitedAssignment.node.operator === '=' &&
			awaitedAssignment.node.children.at(-1) === task.parent?.node &&
			awaitedAssignment.parent?.node.kind === 'ExpressionStatement' &&
			awaitedAssignmentWriteCount === 1;
		if (!directAssignment)
			diagnostics.push(
				'error: an awaited this.task() result must be assigned directly to one writable this.state location'
			);
		const statement = awaitedAssignment?.parent;
		const block = statement?.parent;
		if (
			directAssignment &&
			statement &&
			block?.node.kind === 'Block' &&
			block.node.children
				.slice(block.node.children.indexOf(statement.node) + 1)
				.some((child) => child.kind !== 'ReturnStatement' && child.kind !== 'EmptyStatement')
		)
			diagnostics.push(
				'error: statements after an awaited this.task() assignment require continuation lowering; move them into the task callback or derive them from the assigned state'
			);
		if (componentOwner) {
			const count = (awaitedTasksByComponent.get(componentOwner.node.id) ?? 0) + 1;
			awaitedTasksByComponent.set(componentOwner.node.id, count);
			if (count > 1)
				diagnostics.push(
					'error: multiple awaited tasks in one component setup are not yet supported because their sequential continuation must remain deterministic'
				);
		}
	}
	return { awaited, componentOwner, taskPolicy, diagnostics };
}

/** Finds setup awaits that cannot inherit task cancellation and restart ownership. */
export function unownedComponentAwaitDiagnostics(
	module: BoundModule,
	components: ComponentIndex,
	compilerOwnedAwaits: ReadonlySet<string>
): readonly Readonly<{ message: string; start: number }>[] {
	const output: Array<Readonly<{ message: string; start: number }>> = [];
	for (const component of components.functions) {
		for (const reference of component.walk({ types: false })) {
			if (
				reference.node.kind !== 'AwaitExpression' ||
				compilerOwnedAwaits.has(reference.node.id) ||
				reference.ancestors().functions().first()?.node !== component.node ||
				!reference.node.span
			)
				continue;
			output.push(
				Object.freeze({
					message:
						'error: component setup may only await compiler-owned this.task() work so cancellation and restart semantics remain deterministic',
					start: reference.node.span.start
				})
			);
		}
	}
	return output;
}
