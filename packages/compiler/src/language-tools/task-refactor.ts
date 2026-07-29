import type {
	ExactRefactorPlan,
	ExactRefactorRequest,
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange,
	ExactTaskClassification
} from './contracts.js';

/** Plans the reversible task transformations whose source shape is proven representable. */
export function planExactTaskRefactor(
	request: ExactRefactorRequest,
	source: string,
	inspection: ExactSourceInspection
): ExactRefactorPlan | undefined {
	const entity = inspectedTaskAt(inspection, request.range);
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
		const taskToken = source.indexOf('this.task', entity.range.start);
		if (taskToken < 0 || taskToken >= entity.range.end) return undefined;
		const placement = entity.classification.placement;
		return Object.freeze({
			title: `Make ${placement} placement explicit`,
			semanticChange: 'none',
			explanation: `Adds the compiler-validated ${placement} facet without changing normalized placement.`,
			edits: Object.freeze([
				Object.freeze({
					filename: request.filename,
					range: Object.freeze({
						start: taskToken + 'this.task'.length,
						end: taskToken + 'this.task'.length
					}),
					newText: `.${placement}`
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
	const facets = taskFacets(classification);
	const dependencySource = dependencies.length ? `${dependencies.join(', ')}, ` : '';
	const callbackParameters = [...parameters, ...(needsSignal ? ['{ signal }'] : [])].join(', ');
	const callbackBody = indentLines(body, `${indentation}\t`);
	const replacement =
		`${indentation}this.task${facets}(${dependencySource}async (` +
		`${callbackParameters}) => {\n${indentation}\t${callbackBody}\n${indentation}});`;
	const edits = [
		Object.freeze({
			filename: request.filename,
			range,
			newText: replacement
		})
	];
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
	const authored = source.slice(range.start, range.end).trim();
	const parsed = parseExplicitTask(authored);
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
	if (parsed.signalParameter) {
		if (/\bsignal\b/.test(removeRecognizedSignalOptions(body))) return undefined;
		body = removeRecognizedSignalOptions(body);
	}
	const indentation = source.slice(range.start, range.end).match(/^[\r\n]*([ \t]*)/)?.[1] ?? '';
	const replacement = `${indentation}${body}`;
	const edits = [
		Object.freeze({
			filename: request.filename,
			range,
			newText: replacement
		})
	];
	const componentRange = componentFunctionRange(source, range);
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
	range: ExactSourceRange
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
	return candidates.sort(
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

function taskFacets(classification: ExactTaskClassification): string {
	const facets = [
		classification.placement === 'client' || classification.placement === 'server'
			? classification.placement
			: undefined,
		classification.readiness === 'blocking' ? 'blocking' : undefined,
		classification.priority === 'deferred' ? 'deferred' : undefined
	].filter(Boolean);
	return facets.length ? `.${facets.join('.')}` : '';
}

function parseExplicitTask(source: string):
	| Readonly<{
			dependencies: readonly string[];
			parameters: readonly string[];
			signalParameter: boolean;
			body: string;
	  }>
	| undefined {
	const open = source.indexOf('(');
	const arrow = source.indexOf('=>', open + 1);
	if (open < 0 || arrow < 0) return undefined;
	const callbackStart = source.lastIndexOf('async', arrow);
	if (callbackStart < open) return undefined;
	const argsText = source
		.slice(open + 1, callbackStart)
		.replace(/,\s*$/, '')
		.trim();
	const parameterOpen = source.indexOf('(', callbackStart);
	const parameterClose = findMatching(source, parameterOpen, '(', ')');
	if (parameterOpen < 0 || parameterClose === undefined || parameterClose > arrow) return undefined;
	const bodyOpen = source.indexOf('{', arrow);
	const bodyClose = bodyOpen < 0 ? undefined : findMatching(source, bodyOpen, '{', '}');
	if (bodyOpen < 0 || bodyClose === undefined) return undefined;
	const rawParameters = splitTopLevel(source.slice(parameterOpen + 1, parameterClose));
	const signalParameter = rawParameters.at(-1)?.replace(/\s/g, '') === '{signal}';
	const parameters = signalParameter ? rawParameters.slice(0, -1) : rawParameters;
	const dependencies = splitTopLevel(argsText);
	return Object.freeze({
		dependencies,
		parameters,
		signalParameter,
		body: source.slice(bodyOpen + 1, bodyClose)
	});
}

function splitTopLevel(source: string): string[] {
	const values: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (character === '(' || character === '[' || character === '{') depth++;
		else if (character === ')' || character === ']' || character === '}') depth--;
		else if (character === ',' && depth === 0) {
			values.push(source.slice(start, index).trim());
			start = index + 1;
		}
	}
	const last = source.slice(start).trim();
	if (last) values.push(last);
	return values;
}

function findMatching(
	source: string,
	start: number,
	open: string,
	close: string
): number | undefined {
	if (start < 0 || source[start] !== open) return undefined;
	let depth = 0;
	for (let index = start; index < source.length; index++) {
		if (source[index] === open) depth++;
		else if (source[index] === close && --depth === 0) return index;
	}
	return undefined;
}

function injectSignalOption(statement: string): string | undefined {
	const awaitIndex = statement.indexOf('await ');
	const semicolon = statement.lastIndexOf(';');
	const end = statement.lastIndexOf(')', semicolon >= 0 ? semicolon : statement.length);
	if (awaitIndex < 0 || end < awaitIndex) return undefined;
	const before = statement.slice(0, end);
	if (/\bsignal\b/.test(before.slice(awaitIndex))) return statement;
	return `${before}, { signal }${statement.slice(end)}`;
}

function removeRecognizedSignalOptions(source: string): string {
	return source.replace(/,\s*\{\s*signal\s*\}(?=\s*\))/g, '');
}

function replaceIdentifierPath(source: string, path: string, replacement: string): string {
	return source.split(path).join(replacement);
}

function replaceWholeIdentifier(source: string, identifier: string, replacement: string): string {
	return source.replace(
		new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
		replacement
	);
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
	'placement and readiness',
	'priority',
	'generation cancellation',
	'state publication',
	'error and finally behavior'
] as const;
