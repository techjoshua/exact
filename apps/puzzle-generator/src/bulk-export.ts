import { entryRequest, verifyBulkPuzzlePlan, type BulkPuzzlePlan } from './bulk-plan.js';
import { createPuzzleDocuments, exportBaseName, type DocumentRequest } from './documents.js';
import type { PuzzleStyle } from './types.js';
import { createZipArchive, type ZipArchiveEntry } from './zip-archive.js';

/** The supported number of puzzle/solution pairs in one bulk archive. */
export const BULK_COUNT_LIMIT = 100;

/** One generated pair described by an archive manifest. */
export type BulkPuzzleEntry = {
	number: number;
	title: string;
	seed: number;
	sourceText?: string;
	layout: 'standard' | 'transposed';
	puzzle: string;
	solution: string;
};

/** Public, secret-free generation metadata included in every bulk archive. */
export type BulkPuzzleManifest = {
	format: 'puzzle-foundry-bulk-v2';
	kind: DocumentRequest['kind'];
	count: number;
	baseSeed: number;
	shared: {
		difficulty: DocumentRequest['difficulty'];
		boxSize: DocumentRequest['boxSize'];
		rows: number;
		columns: number;
		style: Omit<PuzzleStyle, 'title'>;
	};
	entries: BulkPuzzleEntry[];
};

/** A completed archive ready for browser download. */
export type BulkPuzzleArchive = { filename: string; bytes: Uint8Array; manifest: BulkPuzzleManifest };

/** Progress reported after each verified plan entry has been rendered. */
export type BulkPuzzleProgress = { completed: number; total: number };

/** Generates a previously authored plan with shared settings and packages its paired documents. */
export async function createBulkPuzzleArchive(
	request: DocumentRequest,
	plan: BulkPuzzlePlan,
	onProgress?: (progress: BulkPuzzleProgress) => void,
	signal?: AbortSignal
): Promise<BulkPuzzleArchive> {
	const count = plan.entries.length;
	if (plan.kind !== request.kind) throw new Error('The edition plan belongs to another puzzle type.');
	if (!Number.isInteger(count) || count < 1 || count > BULK_COUNT_LIMIT)
		throw new Error(`Bulk count must be a whole number from 1 to ${BULK_COUNT_LIMIT}.`);
	const source = plan.entries
		.map((entry) => `# ${entry.title}${entry.wordText ? `\n${entry.wordText}` : ''}`)
		.join('\n---\n');
	const verification = verifyBulkPuzzlePlan(source, request, count);
	if (verification.issues.length) throw new Error(verification.issues.join(' '));

	const encoder = new TextEncoder();
	const width = Math.max(3, String(count).length);
	const files: ZipArchiveEntry[] = [];
	const manifestEntries: BulkPuzzleEntry[] = [];
	for (const [index, entry] of plan.entries.entries()) {
		if (signal?.aborted) throw new DOMException('Bulk puzzle generation was canceled.', 'AbortError');
		const transposed = request.kind === 'crossword' && index % 2 === 1;
		const itemRequest = entryRequest(request, entry, index);
		const documents = createPuzzleDocuments(itemRequest, { transposeCrossword: transposed });
		const number = index + 1;
		const suffix = String(number).padStart(width, '0');
		const puzzle = `puzzles/puzzle-${suffix}.svg`;
		const solution = `solutions/solution-${suffix}.svg`;
		files.push(
			{ path: puzzle, bytes: encoder.encode(documents.puzzleSvg) },
			{ path: solution, bytes: encoder.encode(documents.solutionSvg) }
		);
		manifestEntries.push({
			number,
			title: entry.title,
			seed: itemRequest.seed,
			...(entry.wordText ? { sourceText: entry.wordText } : {}),
			layout: transposed ? 'transposed' : 'standard',
			puzzle,
			solution
		});
		onProgress?.({ completed: number, total: count });
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	const { title: _title, ...sharedStyle } = request.style;
	const manifest: BulkPuzzleManifest = {
		format: 'puzzle-foundry-bulk-v2',
		kind: request.kind,
		count,
		baseSeed: request.seed,
		shared: {
			difficulty: request.difficulty,
			boxSize: request.boxSize,
			rows: request.rows,
			columns: request.columns,
			style: sharedStyle
		},
		entries: manifestEntries
	};
	files.unshift({ path: 'manifest.json', bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) });
	const base = exportBaseName(request.style.title, request.kind);
	return { filename: `${base}-${count}-${request.kind}-puzzles.zip`, bytes: createZipArchive(files), manifest };
}

/** Downloads an owned ZIP byte array and releases its object URL immediately after dispatch. */
export function downloadBulkPuzzleArchive(archive: BulkPuzzleArchive): void {
	const bytes = archive.bytes.buffer.slice(archive.bytes.byteOffset, archive.bytes.byteOffset + archive.bytes.byteLength) as ArrayBuffer;
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
