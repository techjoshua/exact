import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);

/** Requires a passing baseline and a single behavioral assertion failure from the mutated run. */
export async function verifyWitness(root, name, args, mutation, expectedAssertion) {
	await mkdir(path.join(root, '.tmp'), { recursive: true });
	const temporary = await mkdtemp(path.join(root, '.tmp/task-mutation-'));
	try {
		for (const mutated of [false, true]) {
			const report = path.join(temporary, mutated ? 'mutated.json' : 'baseline.json');
			const options = { cwd: root, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 };
			const extra = mutated ? await mutation(temporary) : {};
			let failure;
			try {
				await execute(
					process.execPath,
					[
						'node_modules/vitest/vitest.mjs',
						'run',
						...args,
						...(extra.args ?? []),
						'--reporter=json',
						'--outputFile=' + report
					],
					{ ...options, env: { ...process.env, ...extra.env } }
				);
			} catch (error) {
				failure = error;
			}
			if (!mutated)
				assert.equal(failure, undefined, `${name}: baseline must pass: ${failure?.stderr}`);
			else {
				assert.ok(failure, `${name}: mutation survived`);
				assert.equal(failure.killed, false, `${name}: process timeout is not detection`);
			}
			const results = JSON.parse(await readFile(report, 'utf8'));
			const tests = results.testResults
				.flatMap((suite) => suite.assertionResults)
				.filter((test) => test.status === 'passed' || test.status === 'failed');
			assert.equal(tests.length, 1, `${name}: exactly one witness must execute`);
			assert.equal(tests[0].status, mutated ? 'failed' : 'passed');
			if (mutated) {
				const message = tests[0].failureMessages.join('\n');
				assert.match(
					message,
					/^(?:AssertionError|Error): expected /,
					`${name}: compilation and startup failures do not count`
				);
				assert.match(
					message,
					expectedAssertion,
					`${name}: failure must come from the intended assertion`
				);
				assert.doesNotMatch(
					message,
					/Test timed out|Hook timed out/,
					`${name}: test timeout is not detection`
				);
			}
		}
		console.log(`Detected mutation after passing baseline: ${name}`);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

/** Runs the compiled task observation contract against an isolated faulty compiler binary. */
export async function verifyTaskActivationMutation(root, executable) {
	await verifyWitness(
		root,
		'lost reactive task subscription',
		[
			'--config',
			'packages/component-composition-corpus/vitest.config.ts',
			'packages/component-composition-corpus/src/task-observation.test.ts',
			'-t',
			'view.*mount.*observation'
		],
		async () => ({ env: { EXACT_COMPILER_EXECUTABLE: executable } }),
		/expected.*initial.*deeply equal.*slow[\s\S]*at expectStarts[^\n]*task-observation\.test\.ts/s
	);
}

/** Mutates only the test module graph, leaving source files and built packages untouched. */
export async function verifyTaskStatusMutation(root) {
	await verifyWitness(
		root,
		'nonblocking task reports idle',
		['packages/core/src/tasks/status-lifecycle.test.ts', '-t', 'nonblocking.*normal'],
		async (temporary) => {
			const config = path.join(temporary, 'vitest.config.mts');
			const target = path.join(root, 'packages/core/src/tasks/runtime.ts').replaceAll('\\', '/');
			const anchor = 'state.pendingCount++;\n\tlane.pendingCount++;';
			const replacement = 'if (foreground) { state.pendingCount++; lane.pendingCount++; }';
			await writeFile(
				config,
				`import base from ${JSON.stringify(path.join(root, 'vitest.config.ts'))};
export default {...base, plugins:[...base.plugins, {
 name:'task-status-mutation', enforce:'pre',
 transform(code,id) {
  if(id.replaceAll('\\\\','/').split('?')[0]!==${JSON.stringify(target)}) return;
  const anchor=${JSON.stringify(anchor)};
  if(code.split(anchor).length!==2) throw new Error('Expected exactly one task status mutation anchor');
  return {code:code.replace(anchor,${JSON.stringify(replacement)}),map:null};
 }
}]};`
			);
			return { args: ['--config', config] };
		},
		/expected false to be true[\s\S]*status-lifecycle\.test\.ts/
	);
}
