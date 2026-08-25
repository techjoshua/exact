import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilerAbiOutputs } from './compiler-abi-contract.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes('--check');
const mismatches = [];
for (const [filename, expected] of await compilerAbiOutputs(repositoryRoot)) {
	let actual;
	try {
		actual = await readFile(filename, 'utf8');
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	if (actual === expected) continue;
	if (check) mismatches.push(path.relative(repositoryRoot, filename));
	else await writeFile(filename, expected);
}
if (mismatches.length) {
	throw new Error(`generated compiler ABI files are stale: ${mismatches.join(', ')}`);
}
