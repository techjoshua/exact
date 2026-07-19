import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { root } from './context.mjs';

const execFileAsync = promisify(execFile);

/**
 * Runs the reference trace script for a React fixture workspace.
 */
export async function runReference(workspace) {
	return runNpmJson(workspace, 'trace');
}

/**
 * Runs one named JSON-producing script in a fixture workspace.
 */
export async function runWorkspaceScript(workspace, script) {
	return runNpmJson(workspace, script);
}

/**
 * Runs the eXact implementation for a numbered compatibility phase.
 */
export async function runExactPhase(phase, target) {
	return runJsonProcess(process.execPath, [
		`scripts/run-exact-react-phase${phase}.mjs`,
		String(target)
	]);
}

async function runNpmJson(workspace, script) {
	const npm = npmCommand();
	return runJsonProcess(npm.file, [...npm.args, 'run', script, '-w', workspace, '--silent']);
}

async function runJsonProcess(file, args) {
	const { stdout } = await execFileAsync(file, args, {
		cwd: root,
		encoding: 'utf8',
		windowsHide: true
	});
	return JSON.parse(stdout.trim());
}

function npmCommand() {
	if (process.env.npm_execpath) return { file: process.execPath, args: [process.env.npm_execpath] };
	if (process.platform !== 'win32') return { file: 'npm', args: [] };
	const candidates = [
		process.env.APPDATA &&
			path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
		process.env.ProgramFiles &&
			path.join(process.env.ProgramFiles, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js')
	].filter(Boolean);
	const cli = candidates.find((candidate) => existsSync(candidate));
	if (cli) return { file: process.execPath, args: [cli] };
	return { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd'] };
}
