import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readWorkspaceManifests } from './workspace-manifests.mjs';
import { selectNpmReleasePackages } from './npm-release-commands.mjs';
import { validateNpmPackageMetadata } from './npm-package-metadata.mjs';

const entries = selectNpmReleasePackages(
	await readWorkspaceManifests(path.resolve(import.meta.dirname, '..'))
);
const failures = entries.flatMap(validateNpmPackageMetadata);
const routes = await readFile(
	new URL('../apps/docs/src/docs-manifest.tsx', import.meta.url),
	'utf8'
);
for (const entry of entries) {
	const route = entry.manifest.homepage?.replace('https://techjoshua.github.io/exact/#', '');
	if (!routes.includes(`path: '${route}'`))
		failures.push(`${entry.manifest.name}: unknown documentation route`);
	const readme = await readFile(path.join(path.dirname(entry.filename), 'README.md'), 'utf8');
	if (
		!readme.includes(`](${entry.manifest.homepage})`) ||
		!readme.includes(
			`](https://github.com/techjoshua/exact/tree/main/${entry.manifest.repository.directory})`
		)
	)
		failures.push(
			`${entry.manifest.name}: README must link to public documentation and package source`
		);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(
	`${entries.length} npm packages have explicit discovery, source, and support metadata.`
);
