import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const manifest = fileURLToPath(new URL('../rust-load-driver/Cargo.toml', import.meta.url));
const target = fileURLToPath(new URL('../../.tmp/rust-load-driver-target', import.meta.url));
// Build before entering an isolated benchmark namespace. Measurement never compiles a driver.
const child = spawn(
	'cargo',
	['build', '--locked', '--release', '--manifest-path', manifest, '--target-dir', target],
	{ stdio: 'inherit' }
);
child.once('error', (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.once('exit', (code) => {
	process.exitCode = code ?? 1;
});
