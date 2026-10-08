import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = fileURLToPath(new URL('../rust-load-driver/Cargo.toml', import.meta.url));
const target = fileURLToPath(new URL('../../.tmp/rust-load-driver-target', import.meta.url));
// The binary must be built before these source-only contract tests. No workspace dist is required.
await command('cargo', [
	'test',
	'--locked',
	'--release',
	'--manifest-path',
	manifest,
	'--target-dir',
	target
]);
await command(
	process.execPath,
	[
		'--test',
		'framework-comparison/test/rust-load-driver.test.mjs',
		'framework-comparison/test/ssr-load.test.mjs',
		'framework-comparison/test/ssr-capacity-report.test.mjs'
	],
	{ ...process.env, EXACT_TEST_RUST_DRIVER: '1' }
);

/** Runs a finite validation child and rejects startup or nonzero completion. */
function command(executable, args, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`Validation exited ${code}`))
		);
	});
}
