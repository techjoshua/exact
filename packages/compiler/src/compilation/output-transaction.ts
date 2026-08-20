import { lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Describes one file replacement or deletion in a compiler publication transaction. */
export type CompilerOutputMutation = Readonly<{ file: string; content?: string }>;

type OutputTransactionHost = Readonly<{
	rename: typeof rename;
}>;

type StagedMutation = {
	mutation: CompilerOutputMutation;
	stageFile?: string;
	backupFile: string;
	backupMoved: boolean;
	stagePublished: boolean;
};

const publicationTails = new Map<string, Promise<void>>();

/**
 * Stages a complete compiler output set before replacing its published files.
 * A commit failure restores every prior file before rejecting, preventing a
 * failed build from leaving client, server, shared, or map generations mixed.
 */
export async function publishOutputTransaction(
	mutations: readonly CompilerOutputMutation[],
	host: OutputTransactionHost = { rename }
): Promise<void> {
	const files = new Set<string>();
	for (const mutation of mutations) {
		const file = path.resolve(mutation.file);
		if (files.has(file)) throw new Error(`Compiler output transaction contains duplicate ${file}`);
		files.add(file);
	}
	const release = await acquirePublicationPaths([...files].sort());
	try {
		await publishLockedOutputTransaction(mutations, host);
	} finally {
		release();
	}
}

async function publishLockedOutputTransaction(
	mutations: readonly CompilerOutputMutation[],
	host: OutputTransactionHost
): Promise<void> {
	const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const staged: StagedMutation[] = [];
	for (let index = 0; index < mutations.length; index++) {
		const mutation = mutations[index]!;
		const file = path.resolve(mutation.file);
		await mkdir(path.dirname(file), { recursive: true });
		const content = mutation.content;
		let stageFile: string | undefined;
		if (content !== undefined) {
			stageFile = `${file}.exact-stage-${nonce}-${index}`;
			await writeFile(stageFile, content, { flag: 'wx' });
		}
		staged.push({
			mutation: { ...mutation, file },
			stageFile,
			backupFile: `${file}.exact-backup-${nonce}-${index}`,
			backupMoved: false,
			stagePublished: false
		});
	}

	try {
		for (const item of staged) {
			if (await pathExists(item.mutation.file)) {
				await host.rename(item.mutation.file, item.backupFile);
				item.backupMoved = true;
			}
			if (item.stageFile) {
				await host.rename(item.stageFile, item.mutation.file);
				item.stagePublished = true;
			}
		}
	} catch (error) {
		const rollbackErrors: unknown[] = [];
		for (const item of [...staged].reverse()) {
			try {
				if (item.stagePublished) await removeIfPresent(item.mutation.file);
				if (item.backupMoved) await host.rename(item.backupFile, item.mutation.file);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		await cleanupTransactionFiles(staged);
		if (rollbackErrors.length)
			throw new AggregateError([error, ...rollbackErrors], 'Compiler output publication failed');
		throw error;
	}

	await cleanupTransactionFiles(staged);
}

async function acquirePublicationPaths(files: readonly string[]): Promise<() => void> {
	const releases: Array<() => void> = [];
	for (const file of files) {
		const previous = publicationTails.get(file) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => (release = resolve));
		const tail = previous.catch(() => undefined).then(() => current);
		publicationTails.set(file, tail);
		await previous.catch(() => undefined);
		releases.push(() => {
			release();
			if (publicationTails.get(file) === tail) publicationTails.delete(file);
		});
	}
	return () => {
		for (let index = releases.length - 1; index >= 0; index--) releases[index]!();
	};
}

async function pathExists(file: string): Promise<boolean> {
	try {
		await lstat(file);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw error;
	}
}

async function removeIfPresent(file: string): Promise<void> {
	try {
		await unlink(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

async function cleanupTransactionFiles(staged: readonly StagedMutation[]): Promise<void> {
	await Promise.all(
		staged.flatMap((item) =>
			[item.stageFile, item.backupFile]
				.filter((file): file is string => file !== undefined)
				.map(removeIfPresent)
		)
	);
}
