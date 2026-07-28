import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const compiler = JSON.parse(
	await readFile(path.join(root, 'packages', 'compiler', 'package.json'), 'utf8')
);
const targets = [
	['darwin', 'arm64'],
	['darwin', 'x64'],
	['linux', 'arm64'],
	['linux', 'x64'],
	['win32', 'arm64'],
	['win32', 'x64']
];
const failures = [];

for (const [platform, arch] of targets) {
	const target = `${platform}-${arch}`;
	const name = `@exactjs/compiler-native-${target}`;
	const expectedVersion = `^${compiler.version}`;
	if (compiler.optionalDependencies?.[name] !== expectedVersion) {
		failures.push(
			`packages/compiler/package.json optionalDependencies.${name} must be ${expectedVersion}`
		);
	}
	const templatePath = path.join(root, 'native', 'npm', `compiler-native-${target}`);
	let template;
	try {
		template = JSON.parse(await readFile(path.join(templatePath, 'package.json'), 'utf8'));
	} catch (error) {
		failures.push(`${target}: cannot read package template (${error.message})`);
		continue;
	}
	if (template.name !== name) failures.push(`${target}: template name must be ${name}`);
	if (template.private !== true) failures.push(`${target}: source template must remain private`);
	if (template.exactNativeTarget?.os !== platform || template.exactNativeTarget?.cpu !== arch) {
		failures.push(`${target}: exactNativeTarget does not match its directory`);
	}
	const expectedExecutable = platform === 'win32' ? 'exactc-native.exe' : 'exactc-native';
	if (!template.files?.includes(expectedExecutable))
		failures.push(`${target}: files must include ${expectedExecutable}`);
	if (!template.files?.includes('LICENSE.typescript-go'))
		failures.push(`${target}: files must include the TypeScript-Go license`);
}

const expectedNames = new Set(
	targets.map(([platform, arch]) => `@exactjs/compiler-native-${platform}-${arch}`)
);
for (const name of Object.keys(compiler.optionalDependencies ?? {})) {
	if (name.startsWith('@exactjs/compiler-native-') && !expectedNames.has(name))
		failures.push(`packages/compiler/package.json has unsupported native target ${name}`);
}

if (failures.length) {
	console.error('Native compiler package validation failed:');
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

console.log(`Native compiler package metadata covers ${targets.length} supported targets.`);
