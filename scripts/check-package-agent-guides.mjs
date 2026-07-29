import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const guidedPackages = [
	'packages/core',
	'packages/compiler',
	'packages/language-server',
	'packages/vscode-extension',
	'packages/reactive',
	'packages/dom',
	'packages/ssr',
	'packages/hydrate',
	'packages/server',
	'packages/jsx-runtime',
	'component-libraries/forms',
	'component-libraries/router',
	'framework-adapters/vite-plugin'
];
const repositoryGuides = ['apps/docs/AGENTS.md'];

let failed = false;
for (const relativeRoot of guidedPackages) {
	const packageRoot = path.join(root, relativeRoot);
	const guidePath = path.join(packageRoot, 'AGENTS.md');
	const manifestPath = path.join(packageRoot, 'package.json');
	const label = JSON.parse(readFileSync(manifestPath, 'utf8')).name;

	if (!existsSync(guidePath)) {
		console.error(`${label} is missing its package-local AGENTS.md`);
		failed = true;
		continue;
	}

	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (!manifest.files?.includes('AGENTS.md')) {
		console.error(`${label} does not publish its package-local AGENTS.md`);
		failed = true;
	}
}

for (const guidePath of repositoryGuides) {
	if (existsSync(path.join(root, guidePath))) continue;
	console.error(`repository project is missing its local guide: ${guidePath}`);
	failed = true;
}

const featureGuideRequirements = new Map([
	['packages/core/AGENTS.md', ['this.action()', 'createComponentRegistry()']],
	['packages/compiler/AGENTS.md', ['action identifiers', 'registry identity']],
	['packages/language-server/AGENTS.md', ['stale-result', 'standard LSP', 'untrusted workspace']],
	['packages/vscode-extension/AGENTS.md', ['presentation', 'workspace.isTrusted', 'classifier']],
	['packages/reactive/AGENTS.md', ['Optimistic action rollback']],
	['packages/dom/AGENTS.md', ['component interaction', 'Registry entry keys']],
	['packages/hydrate/AGENTS.md', ['invocation generations', 'component registries']],
	['packages/server/AGENTS.md', ['Action continuations']],
	['packages/ssr/AGENTS.md', ['registry entries', 'action handlers']],
	['packages/jsx-runtime/AGENTS.md', ['InteractionHandler', 'registry']],
	['component-libraries/forms/AGENTS.md', ['interaction host']],
	['component-libraries/router/AGENTS.md', ['current component interaction']],
	['framework-adapters/vite-plugin/AGENTS.md', ['action continuations', 'component-registry']],
	['apps/docs/AGENTS.md', ['proposal', 'README']]
]);

for (const [relativePath, requirements] of featureGuideRequirements) {
	const guide = readFileSync(path.join(root, relativePath), 'utf8');
	for (const requirement of requirements) {
		if (guide.includes(requirement)) continue;
		console.error(`${relativePath} is missing current guidance: ${requirement}`);
		failed = true;
	}
}

const skillPath = path.join(root, 'agents/exact-skill/skills/exact-web-development/SKILL.md');
const skill = readFileSync(skillPath, 'utf8');
for (const required of [
	'package-local `AGENTS.md`',
	'<ErrorBoundary>',
	'className:token',
	'`Map` and `Set`',
	'createExactLanguageService()'
]) {
	if (skill.includes(required)) continue;
	console.error(`eXact agent skill is missing current guidance: ${required}`);
	failed = true;
}

if (failed) process.exit(1);
console.log(
	`project-local agent guides ok (${guidedPackages.length} published packages, ${repositoryGuides.length} repository project)`
);
