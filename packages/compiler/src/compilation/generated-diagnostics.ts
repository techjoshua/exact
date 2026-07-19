import { ExpressionProjectError, rewriteModule, type BoundModule } from '@exact/expressions';
import ts from 'typescript';
import type { analyzeCallableEffects } from '../analysis/callable-effects.js';
import type { ExactCompilerSession } from '../expression/project.js';
import type { TransformTarget } from '../types.js';
import { sessionExpressionModule } from './analysis-results.js';

/** Validates target analysis and throws when the contract is violated. */
export function validateTargetAnalysis(
	effects: ReturnType<typeof analyzeCallableEffects>,
	target: TransformTarget,
	filename: string
): void {
	if (target === 'default') return;
	const forbidden = target === 'client' ? 'server' : 'browser';
	const violation = effects.callables
		.filter((callable) => callable.artifactTargets.includes(target))
		.flatMap((callable) => callable.effectSources.map((source) => ({ callable, source })))
		.find((candidate) => candidate.source.environment === forbidden);
	if (violation) {
		throw new Error(
			`${filename} - error: ${target} artifact retained ${forbidden}-only dependency (${violation.source.path.join(' → ')})`
		);
	}
	const byId = new Map(effects.callables.map((callable) => [callable.id, callable]));
	for (const caller of effects.callables.filter((callable) =>
		callable.artifactTargets.includes(target)
	))
		for (const edge of caller.calls) {
			const callee = edge.targetId ? byId.get(edge.targetId) : undefined;
			if (callee && !callee.artifactTargets.includes(target)) {
				throw new Error(
					`${filename} - error: ${target} artifact graph retains ${caller.name} → ${callee.name}, but ${callee.name} is omitted`
				);
			}
		}
}

/** Produces an expression rewrite in its external representation. */
export function emitExpressionRewrite(
	module: BoundModule,
	generated: string,
	root: string | undefined,
	virtual: boolean,
	session: ExactCompilerSession | undefined,
	validation: 'syntax' | 'semantic'
): string {
	const rewritten = rewriteModule(module, (rewriter) => {
		rewriter.replaceTextWhere(
			(reference) => reference.node === module.rootNode,
			() => generated
		);
	});
	const structuralErrors = rewritten
		.validate()
		.filter((diagnostic) => diagnostic.severity === 'error');
	if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);

	const emitted = rewritten.emit().code;
	if (validation === 'syntax') {
		const sourceFile = ts.createSourceFile(
			`${module.filename}.exact.generated.tsx`,
			emitted,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);
		const diagnostics =
			(sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
				.parseDiagnostics ?? [];
		if (diagnostics.length) {
			throw new ExpressionProjectError(
				diagnostics.map((diagnostic) => ({
					...diagnosticFromTypeScript(diagnostic),
					phase: 'syntax' as const
				}))
			);
		}
		return emitted;
	}

	const rebound = sessionExpressionModule(
		session,
		`${module.filename}.exact.generated.tsx`,
		emitted,
		{
			root,
			virtual,
			diagnostics: 'full'
		}
	);
	const baselineErrors = module.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
	const existing = new Map<string, number>();
	for (const diagnostic of baselineErrors) {
		const key = diagnosticIdentity(diagnostic, module.source);
		existing.set(key, (existing.get(key) ?? 0) + 1);
	}
	const introduced = rebound.diagnostics.filter((diagnostic) => {
		if (diagnostic.severity !== 'error') return false;
		const key = diagnosticIdentity(diagnostic, rebound.source);
		const count = existing.get(key) ?? 0;
		if (count) {
			existing.set(key, count - 1);
			return false;
		}
		return !isSyntheticHelperDiagnostic(diagnostic, rebound.source, module.source);
	});
	if (introduced.length) throw new ExpressionProjectError(introduced);
	return rebound.emit().code;
}

/** Performs the diagnostic from type script domain operation. */
export function diagnosticFromTypeScript(diagnostic: ts.Diagnostic): {
	code: string;
	message: string;
	severity: 'error' | 'warning';
	filename?: string;
	span?: { start: number; end: number; line: number; column: number };
} {
	const source = diagnostic.file;
	const start = diagnostic.start;
	const location =
		source && start !== undefined ? source.getLineAndCharacterOfPosition(start) : undefined;
	return {
		code: `TS${diagnostic.code}`,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
		filename: source?.fileName,
		span:
			start === undefined || !location
				? undefined
				: {
						start,
						end: start + (diagnostic.length ?? 0),
						line: location.line + 1,
						column: location.character + 1
					}
	};
}

/** Performs the throw located compiler diagnostics domain operation. */
export function throwLocatedCompilerDiagnostics(
	filename: string,
	sourceFile: ts.SourceFile,
	diagnostics: readonly Readonly<{ message: string; start: number }>[]
): void {
	const errors = diagnostics.filter((diagnostic) => diagnostic.message.startsWith('error:'));
	if (!errors.length) return;
	throw new Error(
		errors
			.map((diagnostic) => {
				const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
				return `${filename}:${location.line + 1}:${location.character + 1} - ${diagnostic.message}`;
			})
			.join('\n')
	);
}

/** Performs the diagnostic identity domain operation. */
export function diagnosticIdentity(
	diagnostic: { code: string; message: string; span?: { start: number; end: number } },
	source: string
): string {
	if (!diagnostic.span) return `${diagnostic.code}:${diagnostic.message}:<global>`;
	const lineStart = source.lastIndexOf('\n', diagnostic.span.start) + 1;
	const lineEnd = source.indexOf('\n', diagnostic.span.end);
	const line = source
		.slice(lineStart, lineEnd < 0 ? source.length : lineEnd)
		.trim()
		.replace(/\s+/g, ' ');
	const token = source.slice(diagnostic.span.start, diagnostic.span.end);
	return `${diagnostic.code}:${diagnostic.message}:${token}:${line}`;
}

/** Reports whether synthetic helper diagnostic. */
export function isSyntheticHelperDiagnostic(
	diagnostic: { code: string; span?: { start: number; end: number } },
	source: string,
	originalSource: string
): boolean {
	if (!diagnostic.span) return false;
	const token = source.slice(diagnostic.span.start, diagnostic.span.end);
	const lineStart = source.lastIndexOf('\n', diagnostic.span.start) + 1;
	const lineEnd = source.indexOf('\n', diagnostic.span.end);
	const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
	// Only compiler-reserved bindings/imports may suppress diagnostics. Author
	// code with the same diagnostic code remains visible at its own location.
	const normalizedLine = line.trim().replace(/\s+/g, ' ');
	const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
	const originalOccurrences = originalSource
		.split(/\r?\n/)
		.filter((original) => normalize(original) === normalizedLine).length;
	const generatedOccurrences = source
		.split(/\r?\n/)
		.filter((generated) => normalize(generated) === normalizedLine).length;
	const retained = originalOccurrences > 0 && generatedOccurrences <= originalOccurrences;
	return (
		/^__exact/.test(token) ||
		(/^\s*import\b/.test(line) && /\b__exact[A-Za-z0-9_$]*\b/.test(line)) ||
		/\b__exact[A-Za-z0-9_$]*\b/.test(line) ||
		!retained
	);
}
