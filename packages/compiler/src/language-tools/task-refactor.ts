import type {
	ExactRefactorPlan,
	ExactRefactorRequest,
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange,
	ExactTaskClassification
} from './contracts.js';
import {
	findMatching,
	parseExplicitTaskSource,
	removeRecognizedSignalOptions
} from './task-refactor-parsing.js';

/** Plans the reversible task transformations whose source shape is proven representable. */
export function planExactTaskRefactor(
	request: ExactRefactorRequest,
	source: string,
	inspection: ExactSourceInspection
): ExactRefactorPlan | undefined {
	const entity = inspectedTaskAt(inspection, request.range, request.kind);
	if (!entity || entity.classification?.kind !== 'task') return undefined;
	if (request.kind === 'convert-to-explicit-task' && entity.kind === 'inferred-task')
		return inferredToExplicit(request, source, entity.range, entity.classification);
	if (request.kind === 'convert-to-inferred-task' && entity.kind === 'explicit-task')
		return explicitToInferred(request, source, entity.range, entity.classification);
	if (
		request.kind === 'make-placement-explicit' &&
		entity.kind === 'explicit-task' &&
		!entity.classification.placementRequest &&
		(entity.classification.placement === 'client' || entity.classification.placement === 'server')
	) {
		const placement = entity.classification.placement;
		const contextToken = source.indexOf('TaskContext', entity.range.start);
		const taskToken = source.indexOf('this.task', entity.range.start);
		const token =
			contextToken >= entity.range.start && contextToken < entity.range.end
				? { start: contextToken + 'TaskContext'.length, text: `.${placement}()` }
				: taskToken >= entity.range.start && taskToken < entity.range.end
					? { start: taskToken + 'this.task'.length, text: `.${placement}` }
					: undefined;
		if (!token) return undefined;
		return Object.freeze({
			title: `Make ${placement} placement explicit`,
			semanticChange: 'none',
			explanation: `Adds the compiler-validated ${placement} facet without changing normalized placement.`,
			edits: Object.freeze([
				Object.freeze({
					filename: request.filename,
					range: Object.freeze({ start: token.start, end: token.start }),
					newText: token.text
				})
			]),
			expected: Object.freeze({
				before: taskSummary(entity.classification),
				after: `${taskSummary(entity.classification)} (explicit placement)`,
				preserved: Object.freeze(preservedSemantics)
			})
		});
	}
	return undefined;
}

function inferredToExplicit(
	request: ExactRefactorRequest,
	source: string,
	range: ExactSourceRange,
	classification: ExactTaskClassification
): ExactRefactorPlan | undefined {
	const authored = source.slice(range.start, range.end);
	const awaitIndex = authored.indexOf('await ');
	if (awaitIndex < 0 || /\btry\b|\bfinally\b|\bcatch\b/.test(authored)) return undefined;
	const indentation = authored.match(/^[\r\n]*([ \t]*)/)?.[1] ?? '';
	const statement = authored.trim();
	const dependencies = uniqueDependencies(classification);
	const parameters = uniqueParameterNames(dependencies);
	let body = statement;
	for (let index = 0; index < dependencies.length; index++)
		body = replaceIdentifierPath(body, dependencies[index]!, parameters[index]!);
	const needsSignal = classification.signalCalls.length > 0;
	if (needsSignal) {
		const injected = injectSignalOption(body);
		if (!injected) return undefined;
		body = injected;
	}
	const functionName = uniqueTaskFunctionName(source);
	const callbackParameters = [
		...parameters.map((parameter, index) => `${parameter}: typeof ${dependencies[index]}`),
		`task: TaskContext = ${taskPolicyDefault(classification)}`
	].join(', ');
	const callbackBody = indentLines(body, `${indentation}\t`);
	const replacement =
		`${indentation}const ${functionName} = async (${callbackParameters}) => {\n` +
		`${indentation}\t${callbackBody}\n${indentation}};\n` +
		`${indentation}${functionName}(${dependencies.join(', ')});`;
	const edits = [
		Object.freeze({
			filename: request.filename,
			range,
			newText: replacement
		})
	];
	if (
		!/\bimport\s+(?:type\s+)?\{[^}]*\bTaskContext\b[^}]*\}\s+from\s+['"]@exactjs\/core['"]/.test(
			source
		)
	)
		edits.push(
			Object.freeze({
				filename: request.filename,
				range: Object.freeze({ start: 0, end: 0 }),
				newText: "import { TaskContext } from '@exactjs/core';\n"
			})
		);
	const componentRange = componentFunctionRange(source, range);
	if (
		componentRange &&
		countInferredAwaits(source.slice(componentRange.start, componentRange.end)) === 1
	) {
		const asyncRange = asyncModifierRange(source, componentRange);
		if (asyncRange)
			edits.push(
				Object.freeze({
					filename: request.filename,
					range: asyncRange,
					newText: ''
				})
			);
	}
	return Object.freeze({
		title: 'Convert inferred task to explicit task',
		semanticChange: 'none',
		explanation:
			'Expresses the compiler-normalized task policy and dependency snapshots explicitly. The service reanalyzes the proposed source before returning this plan.',
		edits: Object.freeze(edits),
		expected: Object.freeze({
			before: taskSummary(classification),
			after: taskSummary({ ...classification, origin: 'explicit' }),
			preserved: Object.freeze(preservedSemantics)
		})
	});
}

function explicitToInferred(
	request: ExactRefactorRequest,
	source: string,
	range: ExactSourceRange,
	classification: ExactTaskClassification
): ExactRefactorPlan | undefined {
	if (
		classification.readiness !== 'blocking' ||
		classification.priority !== 'normal' ||
		classification.resources.length ||
		classification.cleanup !== 'none' ||
		classification.effects.some((effect) => effect.kind === 'external-effect')
	)
		return undefined;
	const parsed = parseExplicitTaskSource(source, range);
	if (!parsed || parsed.dependencies.length !== parsed.parameters.length) return undefined;
	let body = parsed.body.trim();
	if (
		!body ||
		/\btry\b|\bcatch\b|\bfinally\b/.test(body) ||
		/\breturn\s+(?:\(\s*)?(?:function|\(?[^=]*=>)/.test(body)
	)
		return undefined;
	for (let index = 0; index < parsed.parameters.length; index++)
		body = replaceWholeIdentifier(body, parsed.parameters[index]!, parsed.dependencies[index]!);
	if (parsed.contextParameter) {
		const withoutSignalOptions = removeRecognizedSignalOptions(body, parsed.contextParameter);
		if (new RegExp(`\\b${escapeRegExp(parsed.contextParameter)}\\b`).test(withoutSignalOptions))
			return undefined;
		body = withoutSignalOptions;
	}
	const indentation = parsed.indentation;
	const replacement = `${indentation}${body}`;
	const edits = [
		Object.freeze({
			filename: request.filename,
			range: parsed.range,
			newText: replacement
		})
	];
	const componentRange = componentFunctionRange(source, parsed.range);
	if (componentRange && !asyncModifierRange(source, componentRange)) {
		const functionIndex = source.indexOf('function', componentRange.start);
		if (functionIndex >= 0 && functionIndex < range.start)
			edits.push(
				Object.freeze({
					filename: request.filename,
					range: Object.freeze({ start: functionIndex, end: functionIndex }),
					newText: 'async '
				})
			);
	}
	return Object.freeze({
		title: 'Convert explicit task to inferred task',
		semanticChange: 'none',
		explanation:
			'Restores concise awaited component source only for a blocking, resource-free task whose dependencies and signal use are reversible.',
		edits: Object.freeze(edits),
		expected: Object.freeze({
			before: taskSummary(classification),
			after: taskSummary({ ...classification, origin: 'inferred' }),
			preserved: Object.freeze(preservedSemantics)
		})
	});
}

function inspectedTaskAt(
	inspection: ExactSourceInspection,
	range: ExactSourceRange,
	requestKind: ExactRefactorRequest['kind']
): ExactSourceEntity | undefined {
	const candidates: ExactSourceEntity[] = [];
	const visit = (entity: ExactSourceEntity): void => {
		if (
			(entity.kind === 'inferred-task' || entity.kind === 'explicit-task') &&
			overlaps(entity.range, range)
		)
			candidates.push(entity);
		for (const child of entity.children) visit(child);
	};
	for (const component of inspection.components) visit(component);
	const preferredKind =
		requestKind === 'convert-to-inferred-task'
			? 'explicit-task'
			: requestKind === 'convert-to-explicit-task'
				? 'inferred-task'
				: undefined;
	const preferred = preferredKind
		? candidates.filter((candidate) => candidate.kind === preferredKind)
		: candidates;
	return (preferred.length ? preferred : candidates).sort(
		(left, right) => left.range.end - left.range.start - (right.range.end - right.range.start)
	)[0];
}

function uniqueDependencies(classification: ExactTaskClassification): string[] {
	return [
		...new Set(
			classification.dependencies
				.filter((dependency) => dependency.confidence !== 'unknown')
				.map((dependency) => dependency.path.replace(/\.\*$/, ''))
		)
	];
}

function uniqueParameterNames(dependencies: readonly string[]): string[] {
	const used = new Set<string>();
	return dependencies.map((dependency, index) => {
		const raw =
			dependency
				.split('.')
				.at(-1)
				?.replace(/[^\w$]/g, '') || `dependency${index + 1}`;
		let candidate = /^[A-Za-z_$]/.test(raw) ? raw : `dependency${index + 1}`;
		for (let suffix = 2; used.has(candidate); suffix++) candidate = `${raw}${suffix}`;
		used.add(candidate);
		return candidate;
	});
}

function injectSignalOption(statement: string): string | undefined {
	const awaitIndex = statement.indexOf('await ');
	const semicolon = statement.lastIndexOf(';');
	const end = statement.lastIndexOf(')', semicolon >= 0 ? semicolon : statement.length);
	if (awaitIndex < 0 || end < awaitIndex) return undefined;
	const before = statement.slice(0, end);
	if (/\bsignal\b/.test(before.slice(awaitIndex))) return statement;
	return `${before}, { signal: task.signal }${statement.slice(end)}`;
}

function uniqueTaskFunctionName(source: string): string {
	for (let suffix = 1; ; suffix++) {
		const candidate = suffix === 1 ? 'runTask' : `runTask${suffix}`;
		if (!new RegExp(`\\b${candidate}\\b`).test(source)) return candidate;
	}
}

function taskPolicyDefault(classification: ExactTaskClassification): string {
	const policies = [
		classification.placement === 'client' || classification.placement === 'server'
			? classification.placement
			: undefined,
		classification.priority !== 'normal' ? classification.priority : undefined,
		classification.readiness === 'blocking' ? 'blocking' : undefined,
		classification.concurrency !== 'latest' ? classification.concurrency : undefined,
		classification.detached ? 'detached' : undefined
	].filter((value): value is string => value !== undefined);
	return policies.reduce((source, policy) => `${source}.${policy}()`, 'TaskContext');
}

function replaceIdentifierPath(source: string, path: string, replacement: string): string {
	return source.split(path).join(replacement);
}

function replaceWholeIdentifier(source: string, identifier: string, replacement: string): string {
	return source.replace(new RegExp(`\\b${escapeRegExp(identifier)}\\b`, 'g'), replacement);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indentLines(source: string, indentation: string): string {
	return source.replace(/\r?\n/g, `\n${indentation}`);
}

function componentFunctionRange(
	source: string,
	taskRange: ExactSourceRange
): ExactSourceRange | undefined {
	const before = source.slice(0, taskRange.start);
	const functionKeyword = before.lastIndexOf('function ');
	if (functionKeyword < 0) return undefined;
	const asyncMatch = /\basync\s+$/.exec(source.slice(0, functionKeyword));
	const functionStart = asyncMatch ? functionKeyword - asyncMatch[0].length : functionKeyword;
	const parametersStart = source.indexOf('(', functionKeyword);
	const parametersEnd = findMatching(source, parametersStart, '(', ')');
	if (parametersEnd === undefined) return undefined;
	const bodyStart = source.indexOf('{', parametersEnd);
	const bodyEnd = findMatching(source, bodyStart, '{', '}');
	if (bodyStart < 0 || bodyEnd === undefined || bodyEnd < taskRange.end) return undefined;
	return Object.freeze({ start: functionStart, end: bodyEnd + 1 });
}

function asyncModifierRange(
	source: string,
	componentRange: ExactSourceRange
): ExactSourceRange | undefined {
	const prefix = source.slice(componentRange.start, componentRange.start + 40);
	const match = /\basync\s+(?=function\b)/.exec(prefix);
	return match
		? Object.freeze({
				start: componentRange.start + match.index,
				end: componentRange.start + match.index + match[0].length
			})
		: undefined;
}

function countInferredAwaits(source: string): number {
	return [...source.matchAll(/\bawait\s+(?!this\.task\b)/g)].length;
}

function taskSummary(classification: ExactTaskClassification): string {
	return `${classification.origin} ${classification.readiness} ${classification.placement} task`;
}

function overlaps(left: ExactSourceRange, right: ExactSourceRange): boolean {
	return left.start <= right.end && right.start <= left.end;
}

const preservedSemantics = [
	'dependency evaluation and ordering',
	'captured task parameter snapshots',
	'placement and readiness',
	'priority',
	'generation cancellation',
	'state publication',
	'error and finally behavior'
] as const;
