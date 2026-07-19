import { execFileSync } from 'node:child_process';
import process from 'node:process';

const npm = process.env.npm_execpath
	? { file: process.execPath, args: [process.env.npm_execpath] }
	: { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: [] };
for (const workspace of ['@exact/react-reference-18', '@exact/react-reference-19']) {
	const output = execFileSync(
		npm.file,
		[...npm.args, 'run', 'benchmark', '-w', workspace, '--silent'],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
	);
	const result = JSON.parse(output.trim());
	console.log(
		`React ${result.baseline} reference: ${result.iterations} renders, ${result.bytes} bytes, ${result.durationMs.toFixed(1)}ms`
	);
}
