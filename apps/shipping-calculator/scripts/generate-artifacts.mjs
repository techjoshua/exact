import path from 'node:path';
import { compileProjectArtifacts } from '@exactjs/compiler';

const root = path.resolve('src');
const outDir = path.resolve('.exact');
const results = await compileProjectArtifacts([path.join(root, 'App.tsx')], {
	rootDir: root,
	outDir,
	serverComponents: true,
	sourceMap: true
});
console.log(`Generated ${results.length} eXact component artifact set`);
