import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../compiler-confidence/process.mjs';
import { captureFrameworkSources } from './source-snapshot.mjs';
import { summarizeFrameworkCoverage } from './coverage.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, '.tmp/framework-confidence/coverage');
const evidence = path.join(root, '.tmp/framework-confidence/evidence.json');
if (process.argv.length !== 2) throw new Error('Usage: npm run test:framework:coverage');
await mkdir(path.dirname(output), { recursive: true });
// A failed or interrupted rerun must not leave earlier success evidence behind.
await rm(evidence, { force: true });
await rm(output, { recursive: true, force: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const revision = git('rev-parse', 'HEAD');
const initialStatus = git('status', '--porcelain');
const sourceSnapshot = await captureFrameworkSources(root);
const startedAt = new Date().toISOString();
await run(
	process.execPath,
	[
		'node_modules/vitest/vitest.mjs',
		'run',
		'--config',
		'vitest.framework-coverage.config.ts',
		'--coverage',
		'--testTimeout=30000'
	],
	root,
	{ ...process.env, EXACT_COVERAGE: '1' }
);
const summary = summarizeFrameworkCoverage(
	JSON.parse(await readFile(path.join(output, 'coverage-summary.json'), 'utf8')),
	root
);
const finalSnapshot = await captureFrameworkSources(root);
if (finalSnapshot.digest !== sourceSnapshot.digest)
	throw new Error('Framework coverage source changed during execution. Freeze sources and rerun.');
const finalStatus = git('status', '--porcelain');
await writeFile(
	evidence,
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			revision,
			sourceSnapshot,
			initialStatus,
			finalStatus,
			dirty: Boolean(initialStatus || finalStatus),
			limitation:
				'A Git revision does not reproduce uncommitted files. Instrumented timings are not performance results. Package tests do not establish browser or cross-runtime acceptance.',
			node: process.version,
			platform: process.platform,
			architecture: process.arch,
			scope: [
				'core',
				'reactive',
				'dom',
				'ssr',
				'hydrate',
				'server',
				'testing',
				'request',
				'plugin-api',
				'plugin-host',
				'devtools-runtime',
				'devtools-protocol',
				'router'
			],
			...summary
		},
		null,
		2
	) + '\n'
);
console.log(`Framework coverage evidence: ${path.relative(root, evidence)}`);
for (const owner of summary.owners)
	console.log(
		`${owner.owner}: statements ${owner.statements.covered}/${owner.statements.total}, branches ${owner.branches.covered}/${owner.branches.total}`
	);
