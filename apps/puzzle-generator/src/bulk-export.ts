import { createPuzzleDocuments, exportBaseName, type DocumentRequest } from './documents.js';
import { createZipArchive, type ZipArchiveEntry } from './zip-archive.js';

/** The supported number of puzzle/solution pairs in one bulk archive. */
export const BULK_COUNT_LIMIT = 100;

/** One generated pair described by an archive manifest. */
export type BulkPuzzleEntry = {
	number: number;
	seed: number;
	layout: 'standard' | 'transposed';
	puzzle: string;
	solution: string;
};

/** Public, secret-free generation metadata included in every bulk archive. */
export type BulkPuzzleManifest = {
	format: 'puzzle-foundry-bulk-v1';
	kind: DocumentRequest['kind'];
	count: number;
	baseSeed: number;
	request: Omit<DocumentRequest, 'seed'>;
	entries: BulkPuzzleEntry[];
};

/** A completed archive ready for browser download. */
export type BulkPuzzleArchive = {
	filename: string;
	bytes: Uint8Array;
	manifest: BulkPuzzleManifest;
};

/** Progress reported after each content-unique puzzle has been accepted. */
export type BulkPuzzleProgress = {
	completed: number;
	total: number;
};

/**
 * Generates distinct puzzle/solution pairs from one request and packages them with a manifest.
 * Generation is deterministic from the request seed, rejects duplicate generator models, yields
 * between accepted pairs so the browser can repaint, and honors cancellation between attempts.
 */
export async function createBulkPuzzleArchive(
	request: DocumentRequest,
	count: number,
	onProgress?: (progress: BulkPuzzleProgress) => void,
	signal?: AbortSignal
): Promise<BulkPuzzleArchive> {
	if (!Number.isInteger(count) || count < 1 || count > BULK_COUNT_LIMIT)
		throw new Error(`Bulk count must be a whole number from 1 to ${BULK_COUNT_LIMIT}.`);

	const encoder = new TextEncoder();
	const width = Math.max(3, String(count).length);
	const seen = new Set<string>();
	const files: ZipArchiveEntry[] = [];
	const manifestEntries: BulkPuzzleEntry[] = [];
	const maximumAttempts = Math.max(250, count * 200);

	for (let attempt = 0; manifestEntries.length < count && attempt < maximumAttempts; attempt++) {
		throwIfAborted(signal);
		const seed = attempt === 0 ? request.seed : deriveSeed(request.seed, attempt);
		const transposed = request.kind === 'crossword' && attempt % 2 === 1;
		const documents = createPuzzleDocuments(
			{ ...request, seed },
			{ transposeCrossword: transposed }
		);
		if (seen.has(documents.contentIdentity)) continue;
		seen.add(documents.contentIdentity);

		const number = manifestEntries.length + 1;
		const suffix = String(number).padStart(width, '0');
		const puzzle = `puzzles/puzzle-${suffix}.svg`;
		const solution = `solutions/solution-${suffix}.svg`;
		files.push(
			{ path: puzzle, bytes: encoder.encode(documents.puzzleSvg) },
			{ path: solution, bytes: encoder.encode(documents.solutionSvg) }
		);
		manifestEntries.push({
			number,
			seed,
			layout: transposed ? 'transposed' : 'standard',
			puzzle,
			solution
		});
		onProgress?.({ completed: number, total: count });
		await yieldToBrowser();
	}

	if (manifestEntries.length !== count)
		throw new Error(
			`Could only create ${manifestEntries.length} distinct ${request.kind} puzzles after ${maximumAttempts} attempts. Try another seed or input set.`
		);

	const { seed: baseSeed, ...manifestRequest } = request;
	const manifest: BulkPuzzleManifest = {
		format: 'puzzle-foundry-bulk-v1',
		kind: request.kind,
		count,
		baseSeed,
		request: manifestRequest,
		entries: manifestEntries
	};
	files.unshift({
		path: 'manifest.json',
		bytes: encoder.encode(`${JSON.stringify(manifest, undefined, 2)}\n`)
	});
	const base = exportBaseName(request.style.title, request.kind);
	return {
		filename: `${base}-${count}-${request.kind}-puzzles.zip`,
		bytes: createZipArchive(files),
		manifest
	};
}

/** Downloads an owned ZIP byte array and releases its object URL immediately after dispatch. */
export function downloadBulkPuzzleArchive(archive: BulkPuzzleArchive): void {
	const bytes = archive.bytes.buffer.slice(
		archive.bytes.byteOffset,
		archive.bytes.byteOffset + archive.bytes.byteLength
	) as ArrayBuffer;
	const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
	try {
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = archive.filename;
		anchor.click();
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Mixes an ordinal into the visible seed without relying on mutable random state. */
function deriveSeed(baseSeed: number, ordinal: number): number {
	let value = (baseSeed + Math.imul(ordinal, 0x9e3779b9)) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
	return (value ^ (value >>> 16)) >>> 0;
}

/** Uses a DOM exception so cancellation has the same observable contract as fetch. */
function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException('Bulk puzzle generation was canceled.', 'AbortError');
}

/** Lets progress state paint without depending on animation APIs unavailable in tests. */
function yieldToBrowser(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
