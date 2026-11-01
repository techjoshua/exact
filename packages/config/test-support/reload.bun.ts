import { loadExactConfig, loadExactPackageEnhancements } from '../src/node.ts';
import { checkConfigReload, checkStaticEnhancements } from './reload.mjs';

await checkStaticEnhancements(loadExactPackageEnhancements);
await checkConfigReload(loadExactConfig);
await checkConfigReload(loadExactConfig, 'js');
for (const extension of ['ts', 'mts']) {
	await checkConfigReload(loadExactConfig, extension);
}
if (process.platform !== 'win32' && process.getuid?.() !== 0) {
	await checkConfigReload(loadExactConfig, 'mjs', true);
	await checkConfigReload(loadExactConfig, 'js', true);
} else {
	console.log('Read-only directory controls skipped: POSIX non-root permissions required');
}
console.log('Bun configuration reload, metadata and cleanup passed');
