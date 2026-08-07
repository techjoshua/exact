import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildPerformanceFixtures } from './fixture-build.mjs';

const workspace = path.resolve(import.meta.dirname, '..', '..');
const temporary = await mkdtemp(path.join(workspace, '.exact-performance-build-'));

try {
	const result = await buildPerformanceFixtures(temporary);
	process.stdout.write(
		`EXACT_FRAMEWORK_BUILD_SAMPLE=${JSON.stringify({
			elapsedMs: result.elapsedMs,
			bytes: result.bytes
		})}\n`
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
