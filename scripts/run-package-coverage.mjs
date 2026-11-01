import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const packageRoot = process.cwd();
const workspace = process.argv.includes('--workspace');
const testRoot = workspace ? root : packageRoot;
const source = path.relative(testRoot, path.join(packageRoot, 'src')).replaceAll('\\', '/');
const arguments_ = [
	vitest,
	'run',
	...(workspace ? [source] : []),
	'--coverage',
	'--coverage.provider=v8',
	'--coverage.reportOnFailure',
	'--coverage.reporter=text',
	'--coverage.reporter=json-summary',
	'--coverage.reporter=html',
	'--coverage.reportsDirectory=' + path.join(packageRoot, 'coverage'),
	'--coverage.include=' + source + '/**/*.{ts,tsx}',
	'--coverage.exclude=' + source + '/**/*.test.{ts,tsx}',
	'--coverage.exclude=' + source + '/**/*.d.ts',
	'--coverage.exclude=' + source + '/**/fixtures/**',
	'--coverage.exclude=' + source + '/**/test-support/**',
	'--passWithNoTests',
	'--testTimeout=15000'
];

const child = spawn(process.execPath, arguments_, {
	cwd: testRoot,
	env: { ...process.env, EXACT_COVERAGE: '1' },
	stdio: 'inherit'
});

child.once('error', (error) => {
	console.error(error);
	process.exitCode = 1;
});
child.once('exit', (code, signal) => {
	if (signal) {
		console.error(`Coverage process terminated by ${signal}`);
		process.exitCode = 1;
		return;
	}
	process.exitCode = code ?? 1;
});
