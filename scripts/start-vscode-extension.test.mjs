import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { parseLauncherOptions, vscodeExtensionLaunchPlan } from './start-vscode-extension.mjs';

test('the VS Code launcher builds both owners before opening an extension host', () => {
	const options = parseLauncherOptions(['--code', 'code-insiders', '--workspace', 'apps/kanban']);
	const plan = vscodeExtensionLaunchPlan(options);

	assert.deepEqual(
		plan.builds.map((build) => build.args.at(-1)),
		['@exactjs/language-server', '@exactjs/vscode']
	);
	assert.equal(plan.launch.command, 'code-insiders');
	assert.match(plan.launch.args[1], /^--extensionDevelopmentPath=/);
	assert.equal(plan.launch.args[2], path.resolve('apps/kanban'));
});

test('the VS Code launcher supports repeatable dry runs without builds', () => {
	const options = parseLauncherOptions(['--skip-build', '--dry-run']);
	const plan = vscodeExtensionLaunchPlan(options);

	assert.equal(options.dryRun, true);
	assert.deepEqual(plan.builds, []);
	assert.equal(plan.launch.args.at(-1), path.resolve('.'));
});

test('the VS Code launcher rejects incomplete valued options', () => {
	assert.throws(() => parseLauncherOptions(['--workspace']), /requires a value/);
	assert.throws(() => parseLauncherOptions(['--unknown']), /Unknown/);
});
