import { describe, expect, it } from 'vitest';
import { compilerPathInventory } from './compiler-path-inventory.js';
import type { CorpusMode } from './contracts.js';
import { corpusScenarios } from './scenarios.js';

describe('composition corpus inventory', () => {
	it('assigns every known compiler path to exactly one inventory entry', () => {
		const ids = compilerPathInventory.map(({ id }) => id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('covers every compiler path with a named normative scenario', () => {
		const known = new Set<string>(compilerPathInventory.map(({ id }) => id));
		const covered = new Set<string>(corpusScenarios.flatMap(({ compilerPaths }) => compilerPaths));
		const unknown = [...covered].filter((id) => !known.has(id));
		const missing = [...known].filter((id) => !covered.has(id));

		expect({ unknown, missing }).toEqual({ unknown: [], missing: [] });
	});

	it('covers every required rendering mode for each compiler path', () => {
		const scenarioModesByPath = new Map<string, Set<CorpusMode>>();
		for (const scenario of corpusScenarios) {
			for (const path of scenario.compilerPaths) {
				const modes = scenarioModesByPath.get(path) ?? new Set<CorpusMode>();
				for (const mode of scenario.modes) modes.add(mode);
				scenarioModesByPath.set(path, modes);
			}
		}

		const gaps = compilerPathInventory.flatMap((path) => {
			const covered = scenarioModesByPath.get(path.id) ?? new Set<CorpusMode>();
			const missing = path.requiredModes.filter((mode) => !covered.has(mode));
			return missing.length === 0 ? [] : [{ path: path.id, missing }];
		});

		expect(gaps).toEqual([]);
	});

	it('keeps non-native classifications outside native behavior modes', () => {
		const nonNative = new Set(
			compilerPathInventory
				.filter(({ classification }) =>
					['explicit-compatibility', 'diagnostic', 'forbidden-legacy'].includes(classification)
				)
				.map(({ id }) => id)
		);
		const violations = corpusScenarios
			.filter(({ compilerPaths }) => compilerPaths.some((path) => nonNative.has(path)))
			.filter(({ modes }) => modes.length > 0)
			.map(({ id }) => id);

		expect(violations).toEqual([]);
	});
});
