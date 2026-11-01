import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe } from 'vitest';
import { assertDiagnosticBuildWarnings } from '../../test-support/compiler-diagnostic-build.js';

import { ExactViteSourcePreparation } from './source-preparation.js';
import { verifySourcePreparationContract } from '../../test-support/source-preparation-contract.js';
import { verifyAssignmentIdentityContract } from '../../test-support/assignment-identity-contract.js';
import { verifyStatePublicationContract } from '../../test-support/state-publication-contract.js';
import { verifyCompilerIntlStructureContract } from '../../test-support/compiler-intl-structure-contract.js';
import { verifyCompilerStateAliasContract } from '../../test-support/compiler-state-alias-contract.js';
import { verifyRenderProgramContract } from '../../test-support/render-program-contract.js';
import { verifyPolicySubsystemContract } from '../../test-support/policy-subsystem-contracts.js';
import { verifyHostImportIdentityContract } from '../../test-support/host-import-identity-contract.js';
import { verifyTaskCapturedInputsContract } from '../../test-support/task-captured-inputs-contract.js';
import { verifyEnhancementTemplateContract } from '../../test-support/enhancement-template-contract.js';
import { verifyCompilerAliasPolicies } from '../../test-support/callable-alias-policy.js';
import { it } from 'vitest';
import {
	verifyCompilerDiagnostics,
	compilerDiagnosticContracts
} from '../../test-support/compiler-diagnostics.js';

for (const contract of compilerDiagnosticContracts) {
	// Vite's downstream optimizer assumes unchanged built-ins through coercion.
	// Keep this single incompatible regression visible without weakening its oracle.
	it.skipIf(contract === 'Number foreign coercion target projection')(
		`preserves diagnostics and supported corrections for ${contract}`,
		() => verifyCompilerDiagnostics('vite', contract),
		60000
	);
}

it.each(['chain', 'table'] as const)(
	'preserves helper alias return policy (%s)',
	(selection) => verifyCompilerAliasPolicies('vite', selection),
	60000
);

it(
	'preserves enhancement template prop types through both targets',
	() => verifyEnhancementTemplateContract('vite'),
	60000
);

it(
	'preserves captured task inputs through both targets',
	() => verifyTaskCapturedInputsContract('vite'),
	60000
);

it(
	'preserves lexical renderer and capability identity through both targets',
	() => verifyHostImportIdentityContract('vite'),
	60000
);

it.each(['receipts', 'contexts', 'returns', 'console'] as const)(
	'preserves policy subsystem %s',
	(contract) => verifyPolicySubsystemContract('vite', contract),
	60000
);

it(
	'preserves compiled render property order and updates',
	() => verifyRenderProgramContract('vite'),
	60000
);

it(
	'preserves setup state aliases and DOM declaration placement',
	() => verifyCompilerStateAliasContract('vite'),
	60000
);

it(
	'preserves strict translated structure callback types',
	() => verifyCompilerIntlStructureContract('vite'),
	60000
);

it(
	'preserves performed state publication through both targets',
	() => verifyStatePublicationContract('vite'),
	120000
);

it(
	'preserves authored assignment through mount and paired hydration',
	() => verifyAssignmentIdentityContract('vite'),
	120000
);

it(
	'prepares identical source once per target and Intl generation',
	() =>
		verifySourcePreparationContract('vite', ({ filename, intl, options }) => {
			const cache = new ExactViteSourcePreparation();
			return {
				prepare: (source, target) =>
					cache.prepare({ code: source, id: filename, options, intl, warn: () => {} }, target),
				clear: () => cache.clear()
			};
		}),
	60000
);

describe('diagnostic build warning authority', () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	/** Registers each warning-receipt directory for cleanup before any test can fail. */
	async function receipt(diagnostics: Array<{ message: string; code?: string; plugin?: string }>) {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-build-warning-'));
		roots.push(root);
		await writeFile(path.join(root, 'client-build-diagnostics.json'), JSON.stringify(diagnostics));
		return root;
	}

	it('retains and prints the bundler timing advisory without treating it as a correctness diagnostic', async () => {
		const message = '[PLUGIN_TIMINGS] Your build spent significant time in plugin `exact`.';
		const records = [{ code: 'PLUGIN_TIMINGS', message }];
		const root = await receipt(records);
		const warnings = [message];
		await assertDiagnosticBuildWarnings('vite', root, 'client', warnings);
		assert.deepEqual(warnings, [message]);
		assert.deepEqual(
			JSON.parse(await readFile(path.join(root, 'client-build-diagnostics.json'), 'utf8')),
			records
		);
	});
	it.each([
		{
			code: 'PLUGIN_WARNING',
			plugin: 'exact',
			message: '[PLUGIN_TIMINGS] TS2304 authored diagnostic'
		},
		{ code: 'UNRESOLVED_IMPORT', message: 'Unresolved module' },
		{ code: 'PLUGIN_TIMINGS', plugin: 'exact', message: 'Plugin-authored warning' }
	])(
		'rejects real or unknown diagnostics even when their text resembles timing advice: %j',
		async (record) => {
			const root = await receipt([record]);
			await assert.rejects(assertDiagnosticBuildWarnings('vite', root, 'client', [record.message]));
		}
	);
	it('rejects a diagnostic alongside timing advice', async () => {
		const records = [
			{ code: 'PLUGIN_TIMINGS', message: 'Timing advice' },
			{ code: 'PLUGIN_WARNING', plugin: 'exact', message: 'EXACT2004 advisory' }
		];
		const root = await receipt(records);
		await assert.rejects(
			assertDiagnosticBuildWarnings(
				'vite',
				root,
				'client',
				records.map((record) => record.message)
			)
		);
	});
	it('rejects an incomplete warning receipt', async () => {
		const root = await receipt([]);
		await assert.rejects(
			assertDiagnosticBuildWarnings('vite', root, 'client', ['Unexpected warning'])
		);
	});
	it.each(['vite', 'webpack', 'bun'] as const)(
		'accepts a warning-free %s build',
		async (adapter) => {
			const root = await receipt([]);
			await assertDiagnosticBuildWarnings(adapter, root, 'client', []);
		}
	);
	it.each(['webpack', 'bun'] as const)(
		'does not grant a message-only timing exception to %s',
		async (adapter) => {
			const root = await receipt([]);
			await assert.rejects(
				assertDiagnosticBuildWarnings(adapter, root, 'client', [
					'[PLUGIN_TIMINGS] Unexpected warning'
				])
			);
		}
	);
});
