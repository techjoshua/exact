import type {
	NativeCompilerAnalysis,
	NativeCompilerDiagnostic,
	NativeCompilerTask
} from '../native/process-contracts.js';
import type { ExactSourceDiagnostic } from './contracts.js';
import { clampRange, overlaps } from './source-ranges.js';

/** Reports whether a native diagnostic belongs to the eXact framework namespace. */
export function isExactCompilerDiagnostic(diagnostic: NativeCompilerDiagnostic): boolean {
	return diagnostic.code.startsWith('EXACT');
}

/** Projects one compact native diagnostic into the editor-facing explanation model. */
export function sourceDiagnostic(
	filename: string,
	source: string,
	diagnostic: NativeCompilerDiagnostic,
	analysis: NativeCompilerAnalysis
): ExactSourceDiagnostic {
	const range = clampRange(source, diagnostic.start ?? 0, diagnostic.length ?? 0);
	const task = analysis.tasks.find((candidate) =>
		overlaps(clampRange(source, candidate.start, candidate.length), range)
	);
	const related = (task?.effectSources ?? []).map((reason) =>
		Object.freeze({
			message: reason.description,
			filename,
			range
		})
	);
	const placementConflict =
		diagnostic.code === 'EXACT_TASK_PLACEMENT_CONFLICT' ||
		diagnostic.message.includes('browser and server effects');
	return Object.freeze({
		code: diagnostic.code,
		severity: diagnostic.severity === 'info' ? 'information' : diagnostic.severity,
		summary: diagnostic.message,
		explanation: diagnosticExplanation(diagnostic, task),
		range,
		related: Object.freeze(related),
		fixes: Object.freeze(
			placementConflict
				? [
						Object.freeze({
							kind: 'split-placement-conflict' as const,
							title: 'Split client and server work'
						})
					]
				: []
		)
	});
}

function diagnosticExplanation(
	diagnostic: NativeCompilerDiagnostic,
	task: NativeCompilerTask | undefined
): string {
	const facts = task?.effectSources.map((source) => source.description).filter(Boolean) ?? [];
	const consequence =
		task?.environmentEffect === 'mixed'
			? 'The work cannot execute atomically in both environments, so compilation cannot preserve component ownership and ordering.'
			: 'The compiler cannot safely preserve the requested eXact semantics until the source facts are compatible.';
	return [diagnostic.message, ...facts, consequence].join('\n\n');
}
