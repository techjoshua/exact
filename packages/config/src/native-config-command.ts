import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// This packaged entry performs preparation only. Configuration and callbacks
// are evaluated by the parent loader, never in this process.
const maximumResponseBytes = 8 * 1024 * 1024;
let encoded: string;
try {
	const request: unknown = JSON.parse(readFileSync(0, 'utf8'));
	if (
		!request ||
		typeof request !== 'object' ||
		!('source' in request) ||
		typeof request.source !== 'string' ||
		!('configPath' in request) ||
		typeof request.configPath !== 'string'
	)
		throw new Error('Invalid native config preparation request');
	const built = new URL('./native-config-preparation.js', import.meta.url);
	const entry = existsSync(fileURLToPath(built))
		? built
		: new URL('./native-config-preparation.ts', import.meta.url);
	const helper: typeof import('./native-config-preparation.js') = await import(entry.href);
	const prepared = await helper.prepareNativeConfigSource(request.source, request.configPath, {
		emit: false
	});
	encoded = JSON.stringify({ ok: true, packageEnhancements: prepared.packageEnhancements });
	if (Buffer.byteLength(encoded) > maximumResponseBytes)
		throw new Error('Native config declaration response exceeds the 8 MiB transport limit');
} catch (error) {
	encoded = JSON.stringify({
		ok: false,
		error: {
			name: error instanceof Error ? error.name : 'Error',
			message: (error instanceof Error ? error.message : String(error)).slice(0, 8192)
		}
	});
}
process.stdout.write(encoded);
