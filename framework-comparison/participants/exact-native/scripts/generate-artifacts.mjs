import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '@exactjs/compiler';

const root = path.resolve('src');
const outDir = path.resolve('.exact');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const results = await compileProjectArtifacts([path.join(root, 'App.tsx')], {
	rootDir: root,
	outDir,
	serverComponents: true,
	sourceMap: true
});
const graph = createExactArtifactGraph(results, {
	packageRoot: process.cwd(),
	sourceRoot: root,
	rootDir: outDir
});
await writeFile(
	path.join(outDir, 'hydration-registration.ts'),
	createExactHydrationRegistrationModule(graph, {
		clientBootstrapExportName: 'createExactComparisonClient'
	})
);
console.log(`Generated ${results.length} native eXact artifact set`);
