import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { capabilityFor } from '../../packages/react-compatibility/dist/index.js';
import { outputDirectory, root } from './context.mjs';
import { runExactPhase, runWorkspaceScript } from './execution.mjs';

const phaseMessages = {
	1: 'element and shallow-hook',
	2: 'context, effect, ref, memo, and external-store',
	3: 'portal, Suspense, lazy, deferred-value, and transition',
	4: 'class, boundary, PureComponent, lifecycle, and Profiler',
	5: 'server markup, pipeable stream, and hydration',
	6: 'host serialization, identifiers, resources, and bootstrap'
};

/** Validates every implemented compatibility phase against React 18 and React 19. */
export async function validateCompatibilityPhases() {
	for (let phase = 1; phase <= 6; phase++) await validatePhaseCompatibility(phase);
}

/**
 * Confirms that every capability marked as implemented exists in its runtime bundle.
 */
export async function validateImplementedExports(reference, target) {
	const modules = await loadRuntimeModules(target);
	const missing = [];
	for (const [moduleName, implementation] of Object.entries(modules)) {
		for (const name of reference.exports[moduleName] ?? []) {
			const capability = capabilityFor(moduleName, name, reference.baseline);
			if (
				capability &&
				(capability.status === 'supported' || capability.status === 'approximate') &&
				!(name in implementation)
			) {
				missing.push(`${moduleName}:${name}`);
			}
		}
	}
	if (missing.length)
		throw new Error(
			`Implemented React ${reference.baseline} capabilities are missing runtime exports:\n  ${missing.join('\n  ')}`
		);
}

async function validatePhaseCompatibility(phase) {
	const script = `phase${phase}`;
	const [reference18, exact18, reference19, exact19] = await Promise.all([
		runWorkspaceScript('@exactjs/react-reference-18', script),
		runExactPhase(phase, 18),
		runWorkspaceScript('@exactjs/react-reference-19', script),
		runExactPhase(phase, 19)
	]);
	const cases = [
		[reference18, exact18],
		[reference19, exact19]
	];
	for (const [reference, exact] of cases) assertPhaseTrace(`Phase ${phase}`, reference, exact);

	// Phase 1 is intentionally transient; later phase traces are retained for diagnosis.
	if (phase > 1) {
		writeTrace(phase, 18, exact18);
		writeTrace(phase, 19, exact19);
	}
	console.log(
		`React Phase ${phase} ${phaseMessages[phase]} traces agree with React 18 and React 19`
	);
}

function assertPhaseTrace(label, reference, exact) {
	const expected = { ...reference, baseline: undefined };
	const actual = { ...exact, baseline: undefined };
	if (JSON.stringify(expected) !== JSON.stringify(actual)) {
		throw new Error(
			`React ${label} trace diverged for ${reference.baseline}:\nexpected ${JSON.stringify(reference, null, 2)}\nactual ${JSON.stringify(exact, null, 2)}`
		);
	}
}

function writeTrace(phase, target, trace) {
	writeFileSync(
		path.join(outputDirectory, `phase-${phase}-exact-${target}.json`),
		`${JSON.stringify(trace, null, 2)}\n`
	);
}

async function loadRuntimeModules(target) {
	const modules = {
		react: await loadModule('packages', 'react-compat', 'dist', `react${target}.js`),
		'react/jsx-runtime': await loadModule(
			'packages',
			'react-compat',
			'dist',
			`jsx-runtime${target}.js`
		),
		'react/jsx-dev-runtime': await loadModule(
			'packages',
			'react-compat',
			'dist',
			`jsx-dev-runtime${target}.js`
		),
		'react-dom': await loadModule('packages', 'react-dom-compat', 'dist', `react${target}.js`),
		'react-dom/client': await loadModule(
			'packages',
			'react-dom-compat',
			'dist',
			`client${target}.js`
		),
		'react-dom/server': await loadModule(
			'packages',
			'react-dom-compat',
			'dist',
			`server${target}.js`
		)
	};
	if (target === 19) {
		modules['react-dom/static'] = await loadModule(
			'packages',
			'react-dom-compat',
			'dist',
			'static19.js'
		);
		modules['react/compiler-runtime'] = await loadModule(
			'packages',
			'react-compat',
			'dist',
			'compiler-runtime.js'
		);
	}
	return modules;
}

async function loadModule(...segments) {
	return import(pathToFileURL(path.join(root, ...segments)).href);
}
