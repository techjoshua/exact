import type { ExactRouteDefinition } from './contracts.js';
import { segments } from './locations.js';

/** A segment transition retaining its original pattern position for omission reconstruction. */
type PatternSegment = {
	kind: 'segment';
	route: number;
	position: number;
	value: string;
	caseSensitive?: boolean;
};

/** A route-pattern transition whose reachability depends only on its input cursor. */
type PathStep = { kind: 'reset' } | { kind: 'index' } | PatternSegment;

/**
 * Resolves optional parameter omissions against the complete branch before matching captures.
 * Prefers consuming an optional parameter when completion remains possible. Dynamic programming
 * bounds time and memory by (route count + pattern segments) times (URL segments + 1),
 * avoiding exponential searches.
 * Returns null when no planning is needed, or undefined when no completion exists.
 * Original route objects and patterns stay unchanged.
 */
export function planOptionalPaths(
	routes: readonly ExactRouteDefinition[],
	input: readonly string[],
	end: boolean
): readonly string[] | null | undefined {
	if (!routes.some((route) => route.path?.includes('?'))) return null;
	const patterns = routes.map((route) => (route.index ? [] : segments(route.path ?? '')));
	const steps: PathStep[] = [];
	let prefix: PatternSegment[] = [];
	const mirrors: {
		target: PatternSegment;
		source: PatternSegment;
	}[] = [];
	for (let route = 0; route < routes.length; route++) {
		const definition = routes[route]!;
		const absolute = definition.path?.startsWith('/');
		const shared =
			absolute &&
			prefix.every((step, index) => patterns[route]![index] === step.value) &&
			!prefix.some((step) => step.value === '*')
				? prefix.length
				: 0;
		if (absolute && !shared) {
			steps.push({ kind: 'reset' });
			prefix = [];
		}
		const ownPrefix: PatternSegment[] = [];
		if (definition.index) steps.push({ kind: 'index' });
		for (let position = 0; position < patterns[route]!.length; position++) {
			const value = patterns[route]![position]!;
			const step: PatternSegment = {
				kind: 'segment',
				route,
				position,
				value,
				caseSensitive: definition.caseSensitive
			};
			if (position < shared) {
				const source = prefix[position]!;
				// Repeated prefixes must satisfy every descendant's literal case policy.
				if (definition.caseSensitive) source.caseSensitive = true;
				mirrors.push({ target: step, source });
				ownPrefix.push(source);
			} else {
				steps.push(step);
				ownPrefix.push(step);
			}
			if (value === '*') break;
		}
		if (absolute) prefix = ownPrefix;
		else for (const step of ownPrefix) prefix.push(step);
	}
	const reachable: Uint8Array[] = Array(steps.length + 1);
	const terminal = new Uint8Array(input.length + 1);
	if (end) terminal[input.length] = 1;
	else terminal.fill(1);
	reachable[steps.length] = terminal;
	for (let index = steps.length - 1; index >= 0; index--) {
		const step = steps[index]!;
		const next = reachable[index + 1]!;
		const row = new Uint8Array(input.length + 1);
		if (step.kind === 'reset') row.fill(next[0]!);
		else if (step.kind === 'index') row[input.length] = next[input.length]!;
		else if (step.value === '*') row.fill(next[input.length]!);
		else {
			const parameter = step.value.startsWith(':');
			const optional = parameter && step.value.endsWith('?');
			for (let cursor = 0; cursor <= input.length; cursor++) {
				const consumes =
					cursor < input.length &&
					(parameter || literalSegmentMatches(input[cursor]!, step.value, step.caseSensitive));
				row[cursor] = (consumes ? next[cursor + 1]! : 0) || (optional ? next[cursor]! : 0);
			}
		}
		reachable[index] = row;
	}
	if (!reachable[0]![0]) return undefined;
	const omitted = patterns.map(() => new Set<number>());
	let cursor = 0;
	for (let index = 0; index < steps.length; index++) {
		const step = steps[index]!;
		if (step.kind === 'reset') cursor = 0;
		else if (step.kind === 'segment') {
			if (step.value === '*') cursor = input.length;
			else if (
				step.value.startsWith(':') &&
				step.value.endsWith('?') &&
				!(cursor < input.length && reachable[index + 1]![cursor + 1])
			)
				omitted[step.route]!.add(step.position);
			else cursor++;
		}
	}
	// Absolute children repeat their authored parent prefix. Reuse its optional choices so
	// parent captures and pathname ranges agree with the child's complete match.
	for (const { target, source } of mirrors)
		if (omitted[source.route]!.has(source.position)) omitted[target.route]!.add(target.position);
	return patterns.map(
		(pattern, route) =>
			(routes[route]!.path?.startsWith('/') ? '/' : '') +
			pattern.filter((_, position) => !omitted[route]!.has(position)).join('/')
	);
}

/** Compares a literal segment using the route's authored case policy. */
export function literalSegmentMatches(
	actual: string,
	expected: string,
	caseSensitive?: boolean
): boolean {
	return caseSensitive ? actual === expected : actual.toLowerCase() === expected.toLowerCase();
}
