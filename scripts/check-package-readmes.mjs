import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set(['.git', '.exact', 'coverage', 'dist', 'node_modules']);
const failures = [];
let packages = 0;

await visit(root, true);

if (failures.length) {
	for (const failure of failures) console.error(failure);
	process.exitCode = 1;
} else {
	console.log(`${packages} package README files are present and current-scope clean.`);
}

async function visit(directory, isRoot = false) {
	const entries = await readdir(directory, { withFileTypes: true });
	const manifestEntry = entries.find((entry) => entry.isFile() && entry.name === 'package.json');
	if (manifestEntry && !isRoot) await validatePackage(directory);
	for (const entry of entries) {
		if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
		await visit(path.join(directory, entry.name));
	}
}

async function validatePackage(directory) {
	packages++;
	const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
	const entries = await readdir(directory);
	const readmeName = entries.find((entry) => entry.toLowerCase() === 'readme.md');
	const relative = path.relative(root, directory).replaceAll('\\', '/');
	if (!readmeName) {
		failures.push(`${relative}: missing README.md`);
		return;
	}
	const contents = await readFile(path.join(directory, readmeName), 'utf8');
	if (contents.trim().length < 100) failures.push(`${relative}/${readmeName}: README is too brief`);
	if (/(?:^|[^a-z])@exact\//i.test(contents)) {
		failures.push(`${relative}/${readmeName}: contains the retired @exact package scope`);
	}
	if (!manifest.private && !contents.startsWith(`# ${manifest.name}\n`)) {
		failures.push(`${relative}/${readmeName}: first heading must be "# ${manifest.name}"`);
	}
}
