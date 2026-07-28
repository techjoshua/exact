import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { compileFileArtifacts } from '@exactjs/compiler';

const root = path.resolve('src');
const outDir = path.resolve('.exact');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const names = ['IdentityProvider', 'ProfilePage'];
const results = [];
for (const name of names) {
	results.push(
		await compileFileArtifacts(path.join(root, `${name}.tsx`), {
			rootDir: root,
			outDir,
			filename: path.join('apps', 'server-components', 'src', `${name}.tsx`),
			serverComponents: true,
			packageType: 'application',
			packageName: '@exactjs/sample-server-components'
		})
	);
}
console.log(`Generated ${results.length} eXact server-component artifact sets`);
