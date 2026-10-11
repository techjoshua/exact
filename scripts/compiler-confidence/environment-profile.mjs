import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { adapterWitnesses } from './environment-witnesses.mjs';
import { readBunExecution } from './bun-evidence.mjs';
import { verifyExecution } from './evidence.mjs';
import { verifyRuntimeExecution } from './runtime-evidence.mjs';

/** Executes existing acceptance journeys freshly, with host-specific reports and no cached evidence. */
export async function collectEnvironmentEvidence({ root, output, run }) {
	const vitest = adapterWitnesses.filter((witness) => !witness.file.includes('/bun-plugin/'));
	const adapterReport = path.join(output, 'adapters.json');
	await run(process.execPath, [
		path.join(root, 'node_modules/vitest/vitest.mjs'),
		'run',
		...new Set(vitest.map((witness) => witness.file)),
		'--reporter=default',
		'--reporter=json',
		'--outputFile.json=' + adapterReport
	]);
	const executions = verifyExecution(
		JSON.parse(await readFile(adapterReport, 'utf8')),
		vitest,
		root
	);
	const bunRoot = path.join(root, 'framework-adapters/bun-plugin');
	const bunReport = path.join(output, 'bun.xml');
	await run(
		process.env.BUN_EXECUTABLE ?? 'bun',
		[
			'test',
			...new Set(
				adapterWitnesses
					.filter((witness) => witness.file.includes('/bun-plugin/'))
					.map((witness) => path.relative(bunRoot, path.join(root, witness.file)))
			),
			'--reporter=junit',
			'--reporter-outfile=' + bunReport
		],
		{ cwd: bunRoot }
	);
	executions.push(
		...verifyExecution(
			readBunExecution(await readFile(bunReport, 'utf8'), bunRoot),
			adapterWitnesses.filter((witness) => witness.file.includes('/bun-plugin/')),
			root
		)
	);
	const runtimeReport = path.join(output, 'runtime.json');
	const context = { runToken: randomUUID(), started: new Date().toISOString() };
	await run(process.execPath, [path.join(root, 'scripts/runtime-acceptance/run.mjs')], {
		env: {
			...process.env,
			EXACT_ACCEPTANCE_REPORT: runtimeReport,
			EXACT_ACCEPTANCE_RUN_TOKEN: context.runToken
		}
	});
	const runtime = JSON.parse(await readFile(runtimeReport, 'utf8'));
	executions.push(...verifyRuntimeExecution(runtime, context));
	return { executions, runtime };
}
