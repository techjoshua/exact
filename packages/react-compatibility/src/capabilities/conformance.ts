import {
	reactCapabilities,
	type ReactBaseline,
	type ReactCapability,
	type ReactCompatibilityModule
} from './inventory.js';

export type ConformanceTrace = Readonly<{
	baseline: ReactBaseline;
	version: string;
	exports: Readonly<Record<string, readonly string[]>>;
	element: Readonly<{ type: string; key: string | null; children: readonly string[] }>;
	serverHtml: string;
	client: Readonly<{
		initialHtml: string;
		updatedHtml: string;
		renders: number;
		events: readonly string[];
	}>;
}>;

export type TraceDifference = Readonly<{ path: string; expected: unknown; actual: unknown }>;

/** Compares observable scenario output while allowing version/export inventories to differ by baseline. */
export function compareConformanceTraces(
	expected: ConformanceTrace,
	actual: ConformanceTrace
): readonly TraceDifference[] {
	const differences: TraceDifference[] = [];
	compareValue('element', expected.element, actual.element, differences);
	compareValue('serverHtml', expected.serverHtml, actual.serverHtml, differences);
	compareValue('client', expected.client, actual.client, differences);
	return differences;
}

export function capabilityFor(
	module: ReactCompatibilityModule,
	name: string,
	baseline: ReactBaseline
): ReactCapability | undefined {
	return reactCapabilities.find(
		(capability) =>
			capability.module === module &&
			capability.name === name &&
			capability.baselines.includes(baseline)
	);
}

function compareValue(
	path: string,
	expected: unknown,
	actual: unknown,
	differences: TraceDifference[]
): void {
	if (Object.is(expected, actual)) return;
	if (Array.isArray(expected) && Array.isArray(actual)) {
		if (expected.length !== actual.length)
			differences.push({
				path: `${path}.length`,
				expected: expected.length,
				actual: actual.length
			});
		for (let index = 0; index < Math.min(expected.length, actual.length); index++) {
			compareValue(`${path}[${index}]`, expected[index], actual[index], differences);
		}
		return;
	}
	if (isRecord(expected) && isRecord(actual)) {
		const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
		for (const key of [...keys].sort())
			compareValue(`${path}.${key}`, expected[key], actual[key], differences);
		return;
	}
	differences.push({ path, expected, actual });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
