import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileProjectArtifacts } from '@exact/compiler';

const root = path.resolve('src');
const outDir = path.resolve('.exact');
await mkdir(outDir, { recursive: true });
const results = await compileProjectArtifacts([path.join(root, 'App.tsx')], {
	rootDir: root,
	outDir,
	filename: 'src/App.tsx',
	serverComponents: true,
	sourceMap: true
});
for (const result of results) {
	for (const artifact of [result.clientFile, result.serverFile]) {
		const source = await readFile(artifact, 'utf8');
		const relocated = source
			.replaceAll('from "./', 'from "../src/')
			.replaceAll("from './", "from '../src/");
		await writeFile(artifact, relocated, 'utf8');
	}
}
console.log(`Generated ${results.length} eXact component artifact set`);
