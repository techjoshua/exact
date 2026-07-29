import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Parses the intentionally small launcher command line. */
export function parseLauncherOptions(arguments_) {
	const options = {
		codeCommand: process.env.EXACT_VSCODE_COMMAND || 'code',
		workspace: repositoryRoot,
		build: true,
		dryRun: false
	};
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		if (argument === '--skip-build') options.build = false;
		else if (argument === '--dry-run') options.dryRun = true;
		else if (argument === '--help' || argument === '-h') return { ...options, help: true };
		else if (argument === '--code' || argument === '--workspace') {
			const value = arguments_[++index];
			if (!value) throw new Error(`${argument} requires a value`);
			if (argument === '--code') options.codeCommand = value;
			else options.workspace = path.resolve(value);
		} else if (argument.startsWith('--code='))
			options.codeCommand = argument.slice('--code='.length);
		else if (argument.startsWith('--workspace='))
			options.workspace = path.resolve(argument.slice('--workspace='.length));
		else throw new Error(`Unknown VS Code extension launcher option: ${argument}`);
	}
	return options;
}

/** Creates the deterministic build and Extension Development Host launch plan. */
export function vscodeExtensionLaunchPlan(options) {
	const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	return Object.freeze({
		cwd: repositoryRoot,
		builds: options.build
			? Object.freeze([
					Object.freeze({
						command: npmCommand,
						args: Object.freeze(['run', 'build', '--workspace', '@exactjs/language-server'])
					}),
					Object.freeze({
						command: npmCommand,
						args: Object.freeze(['run', 'build', '--workspace', '@exactjs/vscode'])
					})
				])
			: Object.freeze([]),
		launch: Object.freeze({
			command: options.codeCommand,
			args: Object.freeze([
				'--new-window',
				`--extensionDevelopmentPath=${path.join(repositoryRoot, 'packages', 'vscode-extension')}`,
				options.workspace
			])
		})
	});
}

/** Builds and starts the repository extension in a fresh VS Code development host. */
export function startVscodeExtension(options) {
	const plan = vscodeExtensionLaunchPlan(options);
	if (options.dryRun) {
		process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
		return;
	}
	for (const build of plan.builds) run(build.command, build.args, plan.cwd);
	run(plan.launch.command, plan.launch.args, plan.cwd, true);
}

function run(command, args, cwd, launching = false) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: 'inherit',
		shell: process.platform === 'win32'
	});
	if (result.error) {
		const hint = launching
			? ' Set EXACT_VSCODE_COMMAND or pass --code when the VS Code CLI has another name.'
			: '';
		throw new Error(`Unable to start ${command}.${hint}`, { cause: result.error });
	}
	if (result.status !== 0)
		throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
}

function usage() {
	return `Usage: npm run dev:vscode-extension -- [options]

Options:
  --code <command>       VS Code CLI command (default: code)
  --workspace <path>     Workspace opened by the development host (default: repository root)
  --skip-build           Reuse existing language-server and extension output
  --dry-run              Print the build and launch plan without executing it
  -h, --help             Show this help

EXACT_VSCODE_COMMAND may also select code-insiders or an absolute CLI path.
`;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
	try {
		const options = parseLauncherOptions(process.argv.slice(2));
		if (options.help) process.stdout.write(usage());
		else startVscodeExtension(options);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
