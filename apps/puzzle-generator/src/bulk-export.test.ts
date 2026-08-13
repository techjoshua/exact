import { describe, expect, it } from 'vitest';
import { BULK_COUNT_LIMIT, createBulkPuzzleArchive } from './bulk-export.js';
import { formatBulkPuzzlePlan, verifyBulkPuzzlePlan, type BulkPuzzlePlan } from './bulk-plan.js';
import type { DocumentRequest } from './documents.js';
import type { PuzzleKind, PuzzleStyle } from './types.js';

const style: PuzzleStyle = {
	title: 'Archive Proof',
	titleAlignment: 'left',
	titleFontFamily: 'serif',
	titleFontSize: 28,
	fontFamily: 'sans',
	fontSize: 20,
	supplementaryFontFamily: 'sans',
	supplementaryFontSize: 14,
	pageSize: 'six-by-nine',
	customPageWidth: 6,
	customPageHeight: 9,
	pageMarginPreset: 'standard',
	pageMargin: 0.5,
	ink: '#111111',
	accent: '#cc3300',
	paper: '#ffffff',
	lineWidth: 1.5,
	monochromeSolution: false,
	crosswordGrid: '#111111',
	crosswordBlocks: '#ffffff',
	sudokuSolutionFont: 'inherit',
	sudokuSolutionBold: false
};

describe('bulk puzzle archives', () => {
	for (const kind of ['sudoku', 'word-search', 'crossword'] as const) {
		it(`pairs distinct ${kind} puzzles and solutions in one portable ZIP`, async () => {
			const progress: number[] = [];
			const archive = await createBulkPuzzleArchive(request(kind), plan(kind, 3), ({ completed }) =>
				progress.push(completed)
			);
			const files = readStoredZip(archive.bytes);
			const manifest = JSON.parse(files.get('manifest.json') ?? '');

			expect(archive.filename).toBe(`archive-proof-3-${kind}-puzzles.zip`);
			expect(progress).toEqual([1, 2, 3]);
			expect([...files.keys()]).toEqual([
				'manifest.json',
				'puzzles/puzzle-001.svg',
				'solutions/solution-001.svg',
				'puzzles/puzzle-002.svg',
				'solutions/solution-002.svg',
				'puzzles/puzzle-003.svg',
				'solutions/solution-003.svg'
			]);
			expect(manifest).toMatchObject({
				format: 'puzzle-foundry-bulk-v2',
				kind,
				count: 3,
				baseSeed: 700
			});
			expect(manifest.shared.style).not.toHaveProperty('title');
			expect(manifest).not.toHaveProperty('apiKey');
			expect(manifest.entries.map((entry: { title: string }) => entry.title)).toEqual([
				'Edition 1', 'Edition 2', 'Edition 3'
			]);
			expect(new Set(manifest.entries.map((entry: { seed: number }) => entry.seed)).size).toBe(3);
			const puzzles = [...files.entries()]
				.filter(([path]) => path.startsWith('puzzles/'))
				.map(([, svg]) => svg);
			expect(new Set(puzzles).size).toBe(3);
			for (const svg of puzzles) expect(svg).toContain('<svg');
		});
	}

	it('rejects quantities outside the supported archive limit', async () => {
		await expect(createBulkPuzzleArchive(request('sudoku'), plan('sudoku', 0))).rejects.toThrow(/1 to 100/);
		await expect(
			createBulkPuzzleArchive(request('sudoku'), plan('sudoku', BULK_COUNT_LIMIT + 1))
		).rejects.toThrow(/1 to 100/);
	});

	it(
		'fulfills a 50-pair production-sized request for every puzzle type',
		async () => {
			for (const kind of ['sudoku', 'word-search', 'crossword'] as const) {
				const archive = await createBulkPuzzleArchive(request(kind), plan(kind, 50));
				expect(archive.manifest.entries).toHaveLength(50);
				expect(new Set(archive.manifest.entries.map((entry) => entry.seed)).size).toBe(50);
			}
		},
		30_000
	);

	it('requires unique titles and per-puzzle source material before export', () => {
		const duplicatePlan: BulkPuzzlePlan = {
			kind: 'word-search',
			entries: [
				{ title: 'Same', wordText: wordsFor(0) },
				{ title: 'Same', wordText: wordsFor(0) }
			]
		};
		const verification = verifyBulkPuzzlePlan(
			formatBulkPuzzlePlan(duplicatePlan),
			request('word-search'),
			2
		);
		expect(verification.issues.join(' ')).toMatch(/repeats the title.*repeats another puzzle’s source/i);
	});
});

/** Creates representative valid input for each generator without involving OpenAI settings. */
function request(kind: PuzzleKind): DocumentRequest {
	return {
		kind,
		difficulty: 'medium',
		seed: 700,
		boxSize: 3,
		rows: 14,
		columns: 14,
		wordText:
			kind === 'crossword'
				? 'ORBIT - Path around a planet\nCOMET - Icy visitor\nMETEOR - Flash in the sky\nTELESCOPE - Viewing instrument\nPLANET - World around a star\nLUNAR - Related to the moon'
				: 'ORBIT\nCOMET\nMETEOR\nTELESCOPE\nPLANET\nLUNAR',
		style
	};
}

function plan(kind: PuzzleKind, count: number): BulkPuzzlePlan {
	return {
		kind,
		entries: Array.from({ length: count }, (_, index) => ({
			title: `Edition ${index + 1}`,
			wordText: kind === 'sudoku' ? '' : kind === 'crossword' ? crosswordFor(index) : wordsFor(index)
		}))
	};
}

function wordsFor(index: number): string {
	return `ORBIT\nCOMET\nMETEOR\nTELESCOPE\nPLANET\nLUNAR\n${letterCode(index)}`;
}

function crosswordFor(index: number): string {
	return `ORBIT - Path around a planet\nCOMET - Icy visitor\nMETEOR - Flash in the sky\nTELESCOPE - Viewing instrument\nPLANET - World around a star\nLUNAR - Related to the moon\n${letterCode(index)} - Edition marker`;
}

function letterCode(index: number): string {
	let value = index;
	let result = 'CODE';
	do {
		result += String.fromCharCode(65 + (value % 26));
		value = Math.floor(value / 26) - 1;
	} while (value >= 0);
	return result;
}

/** Reads stored local ZIP records to verify the browser-created archive's public file contract. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
	const files = new Map<string, string>();
	const decoder = new TextDecoder();
	let offset = 0;
	while (offset + 4 <= bytes.length) {
		const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
		if (view.getUint32(0, true) !== 0x04034b50) break;
		const size = view.getUint32(18, true);
		const nameLength = view.getUint16(26, true);
		const extraLength = view.getUint16(28, true);
		const nameStart = offset + 30;
		const dataStart = nameStart + nameLength + extraLength;
		const path = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
		files.set(path, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
		offset = dataStart + size;
	}
	return files;
}
