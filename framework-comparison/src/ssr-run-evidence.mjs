import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Returns the immutable partial-evidence path paired with one requested SSR output. */
export function ssrTimedCheckpointPath(output) {
	return `${resolve(output)}.timed.json`;
}

/** Writes one complete or partial SSR report without depending on generated package output. */
export async function writeSsrEvidence(output, report) {
	const target = resolve(output);
	await mkdir(resolve(target, '..'), { recursive: true });
	await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
	return target;
}
