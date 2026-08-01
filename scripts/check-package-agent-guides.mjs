import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const guidedPackages = [
	'component-libraries/forms',
	'component-libraries/router',
	'framework-adapters/bun-plugin',
	'framework-adapters/vite-plugin',
	'framework-adapters/webpack-plugin',
	'packages/chromium-devtools',
	'packages/compiler',
	'packages/config',
	'packages/core',
	'packages/devtools-agent',
	'packages/devtools-protocol',
	'packages/devtools-runtime',
	'packages/dom',
	'packages/hydrate',
	'packages/instrumentation',
	'packages/jsx-runtime',
	'packages/language-server',
	'packages/plugin-host',
	'packages/react-compat',
	'packages/react-dom-compat',
	'packages/reactive',
	'packages/request',
	'packages/server',
	'packages/ssr',
	'packages/testing',
	'packages/vscode-extension',
	'plugins/microfrontends',
	'plugins/secrets',
	'react-adapters/convex',
	'react-adapters/jotai',
	'react-adapters/redux',
	'react-adapters/tanstack-query'
];

let failed = false;
for (const relativeRoot of guidedPackages) {
	const packageRoot = path.join(root, relativeRoot);
	const guidePath = path.join(packageRoot, 'AGENTS.md');
	const manifestPath = path.join(packageRoot, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const label = manifest.name;

	if (!existsSync(guidePath)) {
		console.error(`${label} is missing its package-local AGENTS.md`);
		failed = true;
		continue;
	}
	if (!manifest.private && !manifest.files?.includes('AGENTS.md')) {
		console.error(`${label} does not publish its package-local AGENTS.md`);
		failed = true;
	}

	const guide = readFileSync(guidePath, 'utf8');
	const lineCount = guide.trimEnd().split(/\r?\n/).length;
	if (!guide.startsWith('# Using ')) {
		console.error(`${relativeRoot}/AGENTS.md must begin with a usage-oriented heading`);
		failed = true;
	}
	if (!guide.includes('[README](./README.md)')) {
		console.error(`${relativeRoot}/AGENTS.md must link to its human-readable README`);
		failed = true;
	}
	if (lineCount > 20) {
		console.error(`${relativeRoot}/AGENTS.md is too long (${lineCount} lines; maximum 20)`);
		failed = true;
	}
	if (/(^|\n)# Maintaining|Run \`npm|before (changing|editing)|after .* changes/i.test(guide)) {
		console.error(`${relativeRoot}/AGENTS.md contains package-maintenance instructions`);
		failed = true;
	}
}

const skillPath = path.join(root, 'agents/exact-skill/skills/exact-web-development/SKILL.md');
const skill = readFileSync(skillPath, 'utf8');
if (!skill.includes('package-local `AGENTS.md`')) {
	console.error('eXact agent skill does not direct agents to package-local usage guidance');
	failed = true;
}

if (failed) process.exit(1);
console.log(`package usage guides ok (${guidedPackages.length} packages)`);
