import type { ExactSourceRange } from './contracts.js';

/** Reversible source facts extracted from a task with authored policy and its activation. */
export type ParsedExplicitTask = Readonly<{
	dependencies: readonly string[];
	parameters: readonly string[];
	contextParameter?: string;
	body: string;
	range: ExactSourceRange;
	indentation: string;
}>;

/** Parses a function with an authored task policy and its activation call. */
export function parseExplicitTaskSource(
	source: string,
	range: ExactSourceRange
): ParsedExplicitTask | undefined {
	return parseFunctionDefinedTask(source, range);
}

function parseFunctionDefinedTask(
	source: string,
	range: ExactSourceRange
): ParsedExplicitTask | undefined {
	const lineStart = source.lastIndexOf('\n', range.start - 1) + 1;
	const declarationSource = source.slice(lineStart, range.end);
	const declaration = /^([ \t]*)const\s+([A-Za-z_$][\w$]*)\s*=\s*/.exec(declarationSource);
	if (!declaration) return undefined;
	const indentation = declaration[1]!;
	const name = declaration[2]!;
	const authored = declarationSource.slice(declaration[0].length).trim();
	const parameterOpen = authored.indexOf('(');
	const parameterClose = findMatching(authored, parameterOpen, '(', ')');
	const arrow = parameterClose === undefined ? -1 : authored.indexOf('=>', parameterClose);
	const bodyOpen = arrow < 0 ? -1 : authored.indexOf('{', arrow);
	const bodyClose = bodyOpen < 0 ? undefined : findMatching(authored, bodyOpen, '{', '}');
	if (
		parameterOpen < 0 ||
		parameterClose === undefined ||
		arrow < 0 ||
		bodyOpen < 0 ||
		bodyClose === undefined
	)
		return undefined;
	const declarationSemicolon = source.indexOf(';', range.end);
	if (declarationSemicolon < range.end) return undefined;
	const activationStart = skipWhitespace(source, declarationSemicolon + 1);
	if (!source.startsWith(name, activationStart)) return undefined;
	const activationOpen = skipWhitespace(source, activationStart + name.length);
	if (source[activationOpen] !== '(') return undefined;
	const activationClose = findMatching(source, activationOpen, '(', ')');
	if (activationClose === undefined) return undefined;
	const activationSemicolon = skipWhitespace(source, activationClose + 1);
	if (source[activationSemicolon] !== ';') return undefined;
	const rawParameters = splitTopLevel(authored.slice(parameterOpen + 1, parameterClose));
	const context = rawParameters.at(-1);
	if (!context || !/\bTaskContext\b/.test(context)) return undefined;
	const contextParameter = parameterName(context);
	if (!contextParameter) return undefined;
	const parameters = rawParameters.slice(0, -1).map(parameterName);
	if (parameters.some((parameter) => parameter === undefined)) return undefined;
	return Object.freeze({
		dependencies: splitTopLevel(source.slice(activationOpen + 1, activationClose)),
		parameters: parameters as string[],
		contextParameter,
		body: authored.slice(bodyOpen + 1, bodyClose),
		range: Object.freeze({ start: lineStart, end: activationSemicolon + 1 }),
		indentation
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

/** Finds the closing delimiter paired with the opening delimiter at `start`. */
export function findMatching(
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

/** Removes only signal options introduced when compiler-inferred policy was authored. */
export function removeRecognizedSignalOptions(source: string, contextParameter: string): string {
	if (contextParameter === 'signal') return source.replace(/,\s*\{\s*signal\s*\}(?=\s*\))/g, '');
	const escaped = escapeRegExp(contextParameter);
	return source.replace(
		new RegExp(`,\\s*\\{\\s*signal\\s*:\\s*${escaped}\\.signal\\s*\\}(?=\\s*\\))`, 'g'),
		''
	);
}

function parameterName(parameter: string): string | undefined {
	return /^\s*([A-Za-z_$][\w$]*)\b/.exec(parameter)?.[1];
}

function skipWhitespace(source: string, start: number): number {
	let index = start;
	while (index < source.length && /\s/.test(source[index]!)) index++;
	return index;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
