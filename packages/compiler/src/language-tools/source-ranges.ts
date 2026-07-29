import type { NativeCompilerTask } from '../native/process-contracts.js';
import type { ExactSourceRange } from './contracts.js';

/** Authored task range paired with syntax facts needed by semantic projection. */
export type AuthoredTaskRegion = Readonly<{
	origin: 'inferred' | 'explicit';
	range: ExactSourceRange;
	selectionRange: ExactSourceRange;
	awaited: boolean;
	dependencyPaths: readonly string[];
}>;

/** Finds explicit registrations and inferred awaits without double-counting callback awaits. */
export function findTaskRegions(source: string): AuthoredTaskRegion[] {
	const explicit = [
		...source.matchAll(/\b(?:await\s+)?this\.task(?:\.[A-Za-z_$][\w$]*)*\s*\(/g)
	].map((match) => {
		const start = match.index;
		const callStart = start + (match[0].startsWith('await') ? match[0].indexOf('this') : 0);
		const end = findBalancedCallEnd(source, callStart) ?? start + match[0].length;
		const call = source.slice(callStart, end);
		return Object.freeze({
			origin: 'explicit' as const,
			range: statementRange(source, start, end),
			selectionRange: Object.freeze({
				start: callStart,
				end: callStart + 'this.task'.length
			}),
			awaited: /^\s*await\b/.test(match[0]),
			dependencyPaths: Object.freeze(explicitDependencyPaths(call))
		});
	});
	const inferred = [...source.matchAll(/\bawait\s+(?!this\.task\b)/g)]
		.filter(
			(match) =>
				!explicit.some(
					(region) => match.index >= region.range.start && match.index <= region.range.end
				)
		)
		.map((match) => {
			const start = statementStart(source, match.index);
			const end = statementEnd(source, match.index + match[0].length);
			return Object.freeze({
				origin: 'inferred' as const,
				range: Object.freeze({ start, end }),
				selectionRange: Object.freeze({
					start: match.index,
					end: match.index + 'await'.length
				}),
				awaited: true,
				dependencyPaths: Object.freeze([])
			});
		});
	return [...explicit, ...inferred].sort((left, right) => left.range.start - right.range.start);
}

/** Finds the returned render callback that owns a component's reactive view. */
export function findReturnedRender(
	source: string,
	componentRange: ExactSourceRange
): Readonly<{ range: ExactSourceRange; selectionRange: ExactSourceRange }> | undefined {
	const text = source.slice(componentRange.start, componentRange.end);
	const matches = [
		...text.matchAll(/\breturn\s+(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>/g)
	];
	const match = matches.at(-1);
	if (!match) return undefined;
	const start = componentRange.start + match.index;
	const end = statementEnd(source, start + match[0].length);
	return Object.freeze({
		range: Object.freeze({ start, end }),
		selectionRange: Object.freeze({ start, end: start + 'return'.length })
	});
}

/** Returns the first authored position inside a component body. */
export function findBodyStart(source: string, range: ExactSourceRange): number {
	const functionKeyword = source.indexOf('function', range.start);
	let searchFrom = range.start;
	if (functionKeyword >= range.start && functionKeyword < range.end) {
		const parametersStart = source.indexOf('(', functionKeyword);
		const parametersEnd = findMatchingDelimiter(source, parametersStart, '(', ')');
		if (parametersEnd !== undefined) searchFrom = parametersEnd + 1;
	} else {
		const arrow = source.indexOf('=>', range.start);
		if (arrow >= range.start && arrow < range.end) searchFrom = arrow + 2;
	}
	const start = source.indexOf('{', searchFrom);
	return start >= 0 && start < range.end ? start + 1 : range.start;
}

/** Clamps one native offset/length pair to the current authored source. */
export function clampRange(source: string, start: number, length: number): ExactSourceRange {
	const safeStart = Math.max(0, Math.min(source.length, start));
	return Object.freeze({
		start: safeStart,
		end: Math.max(safeStart, Math.min(source.length, safeStart + Math.max(0, length)))
	});
}

/** Locates authored text within a bounded semantic source range. */
export function findTextRange(
	source: string,
	text: string,
	within: ExactSourceRange
): ExactSourceRange | undefined {
	const normalized = text.replace(/\.\*$/, '');
	const index = source.indexOf(normalized, within.start);
	if (index < within.start || index + normalized.length > within.end) return undefined;
	return Object.freeze({ start: index, end: index + normalized.length });
}

/** Reports whether a complete source range is nested inside another. */
export function contains(outer: ExactSourceRange, inner: ExactSourceRange): boolean {
	return inner.start >= outer.start && inner.end <= outer.end;
}

/** Reports whether two half-open source ranges intersect. */
export function overlaps(left: ExactSourceRange, right: ExactSourceRange): boolean {
	return left.start <= right.end && right.start <= left.end;
}

/** Finds the closing parenthesis of an authored call while respecting strings. */
export function findBalancedCallEnd(source: string, callStart: number): number | undefined {
	const open = source.indexOf('(', callStart);
	if (open < 0) return undefined;
	let depth = 0;
	let quote: "'" | '"' | '`' | undefined;
	let escaped = false;
	for (let index = open; index < source.length; index++) {
		const character = source[index]!;
		if (quote) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === '`') {
			quote = character;
			continue;
		}
		if (character === '(') depth++;
		else if (character === ')' && --depth === 0) return index + 1;
	}
	return undefined;
}

/** Escapes an authored identifier for a source-local regular expression. */
export function escapePattern(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Recovers one display path without inventing precision absent from native facts. */
export function inferredDependencyPath(
	source: string,
	range: ExactSourceRange,
	sourceKind: NativeCompilerTask['dependencies'][number]['source']
): string {
	const text = source.slice(range.start, range.end);
	const pattern =
		sourceKind === 'props'
			? /\bprops(?:\.[A-Za-z_$][\w$]*)+/
			: sourceKind === 'state'
				? /\b(?:this\.)?state(?:\.[A-Za-z_$][\w$]*)+/
				: /[A-Za-z_$][\w$]*/;
	return text.match(pattern)?.[0] ?? sourceKind;
}

function explicitDependencyPaths(call: string): string[] {
	const open = call.indexOf('(');
	if (open < 0) return [];
	const close = findMatchingDelimiter(call, open, '(', ')');
	if (close === undefined) return [];
	const argumentsList = splitTopLevel(call.slice(open + 1, close));
	if (argumentsList.length < 2) return [];
	return argumentsList
		.slice(0, -1)
		.map((value) => value.trim())
		.filter((value) => /^(?:props|this\.state|state)\.[A-Za-z_$][\w$.]*$/.test(value));
}

function splitTopLevel(source: string): string[] {
	const values: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (character === '(' || character === '[' || character === '{') depth++;
		else if (character === ')' || character === ']' || character === '}') depth--;
		else if (character === ',' && depth === 0) {
			values.push(source.slice(start, index));
			start = index + 1;
		}
	}
	values.push(source.slice(start));
	return values;
}

function findMatchingDelimiter(
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

function statementStart(source: string, offset: number): number {
	const semicolon = source.lastIndexOf(';', offset - 1);
	const brace = source.lastIndexOf('{', offset - 1);
	const line = Math.max(source.lastIndexOf('\n', offset - 1), source.lastIndexOf('\r', offset - 1));
	return Math.max(semicolon, brace, line) + 1;
}

function statementEnd(source: string, offset: number): number {
	const semicolon = source.indexOf(';', offset);
	const line = source.indexOf('\n', offset);
	if (semicolon >= 0 && (line < 0 || semicolon < line)) return semicolon + 1;
	return line >= 0 ? line : source.length;
}

function statementRange(source: string, start: number, end: number): ExactSourceRange {
	return Object.freeze({
		start: statementStart(source, start),
		end: statementEnd(source, end)
	});
}
