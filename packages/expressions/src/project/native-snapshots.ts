import {
	type API as NativeAPI,
	type Snapshot as NativeSnapshot
} from '@typescript/native/unstable/sync';

/** Change category understood by the native snapshot protocol. */
export type NativeChangeKind = 'changed' | 'created' | 'deleted';

/** State required to publish one immutable native project generation. */
export type NativeSnapshotTransaction = Readonly<{
	native: NativeAPI;
	nativeTsconfigPath: string;
	previous?: NativeSnapshot;
	changes: ReadonlyArray<readonly [string, NativeChangeKind]>;
	overlays: ReadonlyMap<string, string>;
	openFiles: ReadonlySet<string>;
	pendingOpenFiles: ReadonlySet<string>;
	pendingCloseFiles: ReadonlySet<string>;
	nativeFilename(filename: string): string;
}>;

/** Result of advancing a native snapshot transaction. */
export type NativeSnapshotAdvance = Readonly<{
	snapshot: NativeSnapshot;
	snapshotsCreated: number;
}>;

/**
 * Advances the unstable native API while containing its virtual-file ordering
 * workarounds at one boundary.
 */
export function advanceNativeSnapshot(
	transaction: NativeSnapshotTransaction
): NativeSnapshotAdvance {
	const first = transaction.previous === undefined;
	const refreshedOpenFiles = first
		? []
		: transaction.changes
				.filter(
					([filename, kind]) =>
						kind === 'changed' &&
						transaction.overlays.has(filename) &&
						transaction.openFiles.has(filename) &&
						!transaction.pendingOpenFiles.has(filename) &&
						!transaction.pendingCloseFiles.has(filename)
				)
				.map(([filename]) => filename);
	const createdOpenFiles = transaction.changes
		.filter(
			([filename, kind]) =>
				kind === 'created' &&
				transaction.overlays.has(filename) &&
				transaction.openFiles.has(filename)
		)
		.map(([filename]) => filename);
	const openFiles = [...new Set([...transaction.pendingOpenFiles, ...refreshedOpenFiles])];
	const closeFiles = [...transaction.pendingCloseFiles].filter(
		(filename) => !refreshedOpenFiles.includes(filename)
	);
	const intermediates: NativeSnapshot[] = [];
	let snapshot: NativeSnapshot | undefined;
	let snapshotsCreated = 0;
	try {
		/*
		 * Open the configured project before publishing virtual roots. The
		 * server otherwise may list a created root without materializing it.
		 */
		if (first && transaction.changes.length) {
			intermediates.push(
				transaction.native.updateSnapshot({
					openProjects: [transaction.nativeTsconfigPath]
				})
			);
			snapshotsCreated++;
		}
		/*
		 * Changed open virtual files retain stale semantic state unless closed
		 * and reopened in consecutive snapshots.
		 */
		if (refreshedOpenFiles.length) {
			intermediates.push(
				transaction.native.updateSnapshot({
					closeFiles: refreshedOpenFiles.map(transaction.nativeFilename)
				})
			);
			snapshotsCreated++;
		}
		snapshot = transaction.native.updateSnapshot({
			...(first && !intermediates.length ? { openProjects: [transaction.nativeTsconfigPath] } : {}),
			...(openFiles.length ? { openFiles: openFiles.map(transaction.nativeFilename) } : {}),
			...(!first && closeFiles.length
				? { closeFiles: closeFiles.map(transaction.nativeFilename) }
				: {}),
			...(transaction.changes.length ? { fileChanges: nativeFileChanges(transaction) } : {})
		});
		snapshotsCreated++;
		if (createdOpenFiles.length) {
			intermediates.push(snapshot);
			const nativeCreated = createdOpenFiles.map(transaction.nativeFilename);
			intermediates.push(transaction.native.updateSnapshot({ closeFiles: nativeCreated }));
			snapshot = transaction.native.updateSnapshot({
				openFiles: nativeCreated,
				fileChanges: { changed: nativeCreated }
			});
			snapshotsCreated += 2;
		}
	} catch (error) {
		for (const intermediate of intermediates) intermediate.dispose();
		throw error;
	}
	transaction.previous?.dispose();
	for (const intermediate of intermediates) intermediate.dispose();
	transaction.native.clearSourceFileCache();
	return { snapshot, snapshotsCreated };
}

function nativeFileChanges(transaction: NativeSnapshotTransaction) {
	const changed: string[] = [];
	const created: string[] = [];
	const deleted: string[] = [];
	for (const [filename, kind] of transaction.changes) {
		const nativeFilename = transaction.nativeFilename(filename);
		if (kind === 'changed') changed.push(nativeFilename);
		else if (kind === 'created') created.push(nativeFilename);
		else deleted.push(nativeFilename);
	}
	return {
		...(changed.length ? { changed } : {}),
		...(created.length ? { created } : {}),
		...(deleted.length ? { deleted } : {})
	};
}
