import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The workspace has already emitted TypeScript output. Resolve the supported builder from
// the owning package, preserving installed-package isolation and existing package manifests.
const root = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(root, 'package.json'));
const { buildLibrary } = await import(
	pathToFileURL(require.resolve('@exactjs/compiler/library-build')).href
);
await buildLibrary({ root, declarations: false });
