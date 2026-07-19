import { readFileSync } from 'node:fs';
import path from 'node:path';
import { capabilityFor } from '../../packages/react-compatibility/dist/index.js';
import { root } from './context.mjs';

/** Validates that a reference trace came from the expected React baseline. */
export function validateVersion(trace, baseline) {
	if (trace.baseline !== baseline || !trace.version.startsWith(`${baseline.split('.')[0]}.`)) {
		throw new Error(
			`Expected React ${baseline} reference, received ${trace.baseline}/${trace.version}`
		);
	}
}

/** Ensures every exported reference symbol has a declared compatibility capability. */
export function validateInventory(trace) {
	const missing = [];
	for (const [module, names] of Object.entries(trace.exports)) {
		for (const name of names)
			if (!capabilityFor(module, name, trace.baseline)) missing.push(`${module}:${name}`);
	}
	if (missing.length)
		throw new Error(
			`Capability manifest is missing ${trace.baseline} exports:\n  ${missing.join('\n  ')}`
		);
}

/** Counts the exported symbols represented by a reference trace. */
export function inventorySize(trace) {
	return Object.values(trace.exports).reduce((total, names) => total + names.length, 0);
}

/** Validates uniqueness and coverage metadata in the package fixture catalog. */
export function validatePackageFixtureCatalog() {
	const catalog = readRecord('package-fixtures.json');
	if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.fixtures) || !catalog.fixtures.length) {
		throw new Error('React package fixture catalog is empty or has an unsupported schema');
	}
	const packages = new Set();
	for (const fixture of catalog.fixtures) {
		const identity = `${fixture.package}@${fixture.version ?? '*'}`;
		if (typeof fixture.package !== 'string' || packages.has(identity))
			throw new Error(`Invalid or duplicate React package fixture ${identity}`);
		if (!Number.isInteger(fixture.phase) || fixture.phase < 1 || fixture.phase > 6)
			throw new Error(`Invalid phase for React package fixture ${fixture.package}`);
		if (!Array.isArray(fixture.coverage) || !fixture.coverage.length)
			throw new Error(`Missing coverage for React package fixture ${fixture.package}`);
		packages.add(identity);
	}
}

/** Validates the recorded command and compatibility scope for every completed phase. */
export function validatePhaseRecords() {
	validateBaseline();
	for (let phase = 1; phase <= 6; phase++) validatePhaseResult(phase);
}

function validateBaseline() {
	const baseline = readRecord('phase-0-baseline.json');
	if (
		baseline.schemaVersion !== 1 ||
		!Array.isArray(baseline.commands) ||
		!baseline.commands.length
	) {
		throw new Error('React Phase 0 baseline is empty or has an unsupported schema');
	}
	for (const result of baseline.commands) {
		if (typeof result.command !== 'string' || typeof result.status !== 'string')
			throw new Error('React Phase 0 baseline contains an invalid command record');
	}
}

function validatePhaseResult(phase) {
	const result = readRecord(`phase-${phase}-result.json`);
	if (
		result.schemaVersion !== 1 ||
		result.phase !== phase ||
		!Array.isArray(result.commands) ||
		!result.commands.length
	) {
		throw new Error(`React Phase ${phase} result is empty or has an unsupported schema`);
	}
	const requiredScopes =
		phase === 1 ? ['supported', 'deferred'] : ['supported', 'approximate', 'deferred'];
	if (requiredScopes.some((scope) => !Array.isArray(result.compatibility?.[scope]))) {
		throw new Error(`React Phase ${phase} result is missing compatibility scope`);
	}
}

function readRecord(name) {
	const filename = path.join(root, 'packages', 'react-compatibility', name);
	return JSON.parse(readFileSync(filename, 'utf8'));
}
