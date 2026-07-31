import path from 'node:path';
import type { NativeCompilerResponse } from '../native/process-contracts.js';
import type { ExactRefactorPlan, ExactSourceEntity, ExactSourceInspection } from './contracts.js';

/** Creates a separate analyzable filename for an in-memory refactor candidate. */
export function refactorFilename(filename: string): string {
	const extension = path.extname(filename);
	return extension
		? `${filename.slice(0, -extension.length)}.exact-refactor${extension}`
		: `${filename}.exact-refactor.tsx`;
}

/** Applies a complete compiler plan without mutating its authored source input. */
export function applyRefactorEdits(source: string, edits: ExactRefactorPlan['edits']): string {
	let result = source;
	for (const edit of [...edits].sort((left, right) => right.range.start - left.range.start))
		result = `${result.slice(0, edit.range.start)}${edit.newText}${result.slice(edit.range.end)}`;
	return result;
}

/** Returns task entities in authored source order for before/after correlation. */
export function inspectedTasks(inspection: ExactSourceInspection): ExactSourceEntity[] {
	const tasks: ExactSourceEntity[] = [];
	const visit = (entity: ExactSourceEntity): void => {
		if (entity.classification?.kind === 'task') tasks.push(entity);
		for (const child of entity.children) visit(child);
	};
	for (const component of inspection.components) visit(component);
	return tasks.sort((left, right) => left.range.start - right.range.start);
}

/** Compares the stable normalized task fields required for a no-change refactor. */
export function equivalentTaskClassification(
	before: ExactSourceEntity,
	after: ExactSourceEntity
): boolean {
	const left = before.classification;
	const right = after.classification;
	if (left?.kind !== 'task' || right?.kind !== 'task') return false;
	return (
		left.placement === right.placement &&
		left.readiness === right.readiness &&
		left.priority === right.priority &&
		left.concurrency === right.concurrency &&
		left.detached === right.detached &&
		left.publication === right.publication &&
		left.cancellation === right.cancellation &&
		left.cleanup === right.cleanup &&
		equalValues(
			left.dependencies.map((dependency) => [
				dependency.kind,
				dependency.path,
				dependency.confidence
			]),
			right.dependencies.map((dependency) => [
				dependency.kind,
				dependency.path,
				dependency.confidence
			])
		) &&
		equalValues(
			left.capturedInputs.map((input) => [input.parameter, input.kind, input.path]),
			right.capturedInputs.map((input) => [input.parameter, input.kind, input.path])
		) &&
		equalValues(
			left.effects.map((effect) => [effect.kind, effect.path, effect.confidence]),
			right.effects.map((effect) => [effect.kind, effect.path, effect.confidence])
		) &&
		equalValues(
			left.signalCalls.map((call) => [call.parameter, call.mode]),
			right.signalCalls.map((call) => [call.parameter, call.mode])
		) &&
		equalValues(
			left.resources.map((resource) => [resource.kind, resource.disposal]),
			right.resources.map((resource) => [resource.kind, resource.disposal])
		)
	);
}

/** Compares eXact errors while leaving ordinary TypeScript diagnostics to TypeScript tooling. */
export function equivalentExactDiagnostics(
	before: NativeCompilerResponse['diagnostics'],
	after: NativeCompilerResponse['diagnostics']
): boolean {
	const supported = (diagnostics: NativeCompilerResponse['diagnostics']): string[] =>
		diagnostics
			.filter(
				(diagnostic) => diagnostic.severity === 'error' && diagnostic.code.startsWith('EXACT')
			)
			.map((diagnostic) => `${diagnostic.code}:${diagnostic.message}`)
			.sort();
	return equalValues(supported(before), supported(after));
}

/** Reports whether a requested refactor range selects one inspected task. */
export function rangesOverlap(
	left: Readonly<{ start: number; end: number }>,
	right: Readonly<{ start: number; end: number }>
): boolean {
	return left.start <= right.end && right.start <= left.end;
}

function equalValues(left: readonly unknown[], right: readonly unknown[]): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
