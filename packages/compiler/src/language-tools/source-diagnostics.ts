import type {
	NativeCompilerAnalysis,
	NativeCompilerDiagnostic,
	NativeCompilerTask
} from '../native/process-contracts.js';
import type { ExactSourceDiagnostic } from './contracts.js';
import { clampRange, selectsRange } from './source-ranges.js';

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
	// Native diagnostics are finalized as UTF-16. Analysis task spans remain native byte spans.
	const start = Math.max(0, Math.min(source.length, diagnostic.start ?? 0));
	const range = {
		start,
		end: Math.max(start, Math.min(source.length, start + (diagnostic.length ?? 0)))
	};
	const task = analysis.tasks.find((candidate) =>
		selectsRange(clampRange(source, candidate.start, candidate.length), range)
	);
	const related = (task?.effectSources ?? []).map((reason) => ({
		message: reason.description,
		filename,
		range
	}));
	for (const cause of diagnostic.related ?? []) {
		related.push({
			message: cause.message,
			filename: cause.filename,
			range: { start: cause.start, end: cause.start + cause.length }
		});
	}
	const placementConflict =
		diagnostic.code === 'EXACT_TASK_PLACEMENT_CONFLICT' ||
		diagnostic.message.includes('browser and server effects');
	return {
		code: diagnostic.code,
		severity: diagnostic.severity === 'info' ? 'information' : diagnostic.severity,
		summary: diagnostic.message,
		explanation: diagnosticExplanation(diagnostic, task),
		range,
		related: related,
		fixes:
			diagnostic.code === 'EXACT2213' && diagnostic.fixText !== undefined
				? [
						{
							kind: 'acknowledge-dynamic-component' as const,
							title: 'Acknowledge client-only dynamic component',
							edit: {
								filename,
								range: {
									start: diagnostic.fixStart ?? 0,
									end: diagnostic.fixStart ?? 0
								},
								newText: diagnostic.fixText
							}
						}
					]
				: placementConflict
					? [
							{
								kind: 'split-placement-conflict' as const,
								title: 'Split client and server work'
							}
						]
					: []
	};
}

function diagnosticExplanation(
	diagnostic: NativeCompilerDiagnostic,
	task: NativeCompilerTask | undefined
): string {
	const facts = task?.effectSources.map((source) => source.description).filter(Boolean) ?? [];
	const consequence =
		task?.environmentEffect === 'mixed'
			? 'The work cannot execute atomically in both environments, so compilation cannot preserve component ownership and ordering.'
			: '';
	return [...new Set([diagnostic.message, ...facts, consequence].filter(Boolean))].join('\n\n');
}
