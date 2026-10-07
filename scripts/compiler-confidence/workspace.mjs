import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** Reclaims only abandoned coverage workspaces whose recorded process no longer exists. */
export async function reclaimNativeCoverageWorkspaces(directory) {
	await mkdir(directory, { recursive: true });
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const owner = /^run-(\d+)-/.exec(entry.name);
		if (!entry.isDirectory() || !owner) continue;
		try {
			process.kill(Number(owner[1]), 0);
		} catch (error) {
			if (error.code === 'ESRCH')
				await rm(path.join(directory, entry.name), { recursive: true, force: true });
		}
	}
}

/**
 * Gives one instrumented invocation private build and temporary storage. Cleanup runs
 * after success or failure. Abandoned workspaces from an uncatchable kill are reclaimed
 * on the next run. Caller-owned environment and the ordinary Go cache are untouched.
 */
export async function withNativeCoverageWorkspace(directory, environment, work) {
	await reclaimNativeCoverageWorkspaces(directory);
	const workspace = await mkdtemp(path.join(directory, `run-${process.pid}-`));
	try {
		const temporary = path.join(workspace, 'temporary');
		await mkdir(temporary);
		return await work({
			...environment,
			GOCACHE: path.join(workspace, 'go-cache'),
			TMPDIR: temporary,
			TMP: temporary,
			TEMP: temporary
		});
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}
