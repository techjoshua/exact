import { createPuzzleDocuments, type DocumentRequest } from './documents.js';
import type { PuzzleKind } from './types.js';
import { parseCrosswordClues, parseWords } from './words.js';

/** One manually reviewable puzzle definition in a bulk edition. */
export type BulkPuzzlePlanEntry = {
	title: string;
	wordText: string;
};

/** Per-puzzle content that is combined with shared generation and print settings. */
export type BulkPuzzlePlan = {
	kind: PuzzleKind;
	entries: BulkPuzzlePlanEntry[];
};

/** Machine verification of an editable edition plan. */
export type BulkPlanVerification = {
	plan?: BulkPuzzlePlan;
	issues: string[];
	warnings: string[];
};

/** Creates an editable plan draft from the current puzzle, numbering every title independently. */
export function createManualBulkPlan(request: DocumentRequest, count: number): BulkPuzzlePlan {
	return {
		kind: request.kind,
		entries: Array.from({ length: count }, (_, index) => ({
			title: numberedTitle(request.style.title, request.kind, index + 1),
			wordText: request.kind === 'sudoku' ? '' : request.wordText.trim()
		}))
	};
}

/** Serializes a plan into the human-editable block format shown in the bulk editor. */
export function formatBulkPuzzlePlan(plan: BulkPuzzlePlan): string {
	return plan.entries
		.map((entry) => `# ${entry.title}${entry.wordText ? `\n${entry.wordText}` : ''}`)
		.join('\n---\n');
}

/** Parses titled blocks separated by a line containing only three hyphens. */
export function parseBulkPuzzlePlan(source: string, kind: PuzzleKind): BulkPuzzlePlan {
	const blocks = source
		.split(/^\s*---\s*$/m)
		.map((block) => block.trim())
		.filter(Boolean);
	if (!blocks.length) throw new Error('Add at least one titled puzzle block.');
	return {
		kind,
		entries: blocks.map((block, index) => {
			const [titleLine = '', ...content] = block.split(/\r?\n/);
			const title = titleLine.match(/^#{1,2}\s+(.+?)\s*$/)?.[1]?.trim();
			if (!title) throw new Error(`Puzzle ${index + 1} must begin with “# Title”.`);
			return { title, wordText: content.join('\n').trim() };
		})
	};
}

/**
 * Verifies titles, source-material uniqueness, generator validity, and rendered-model uniqueness.
 * Warnings remain reviewable but do not prevent export; issues must be corrected and rechecked.
 */
export function verifyBulkPuzzlePlan(
	source: string,
	request: DocumentRequest,
	expectedCount: number
): BulkPlanVerification {
	let plan: BulkPuzzlePlan;
	try {
		plan = parseBulkPuzzlePlan(source, request.kind);
	} catch (error) {
		return { issues: [error instanceof Error ? error.message : String(error)], warnings: [] };
	}
	const issues: string[] = [];
	const warnings: string[] = [];
	if (plan.entries.length !== expectedCount)
		issues.push(`The plan contains ${plan.entries.length} puzzles; the quantity is ${expectedCount}.`);

	const titles = new Set<string>();
	const sources = new Set<string>();
	const models = new Set<string>();
	for (const [index, entry] of plan.entries.entries()) {
		const number = index + 1;
		const normalizedTitle = entry.title.toLocaleLowerCase();
		if (titles.has(normalizedTitle)) issues.push(`Puzzle ${number} repeats the title “${entry.title}”.`);
		titles.add(normalizedTitle);
		if (request.kind !== 'sudoku') {
			if (!entry.wordText) {
				issues.push(`Puzzle ${number} needs its own ${request.kind === 'crossword' ? 'answers and clues' : 'word list'}.`);
				continue;
			}
			const identity = sourceIdentity(entry.wordText, request.kind);
			if (sources.has(identity))
				issues.push(`Puzzle ${number} repeats another puzzle’s source material.`);
			sources.add(identity);
		}
		try {
			const documents = createPuzzleDocuments(
				entryRequest(request, entry, index),
				{ transposeCrossword: request.kind === 'crossword' && index % 2 === 1 }
			);
			if (models.has(documents.contentIdentity))
				issues.push(`Puzzle ${number} generates the same puzzle model as another entry.`);
			models.add(documents.contentIdentity);
			if (documents.warning) warnings.push(`Puzzle ${number}: ${documents.warning}`);
		} catch (error) {
			issues.push(`Puzzle ${number}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { plan, issues, warnings };
}

/** Combines one plan entry with edition-wide generator and print settings. */
export function entryRequest(
	request: DocumentRequest,
	entry: BulkPuzzlePlanEntry,
	index: number
): DocumentRequest {
	return {
		...request,
		seed: deriveBulkSeed(request.seed, index),
		wordText: entry.wordText,
		style: { ...request.style, title: entry.title }
	};
}

/** Deterministically derives one entry seed from the edition's visible base seed. */
export function deriveBulkSeed(baseSeed: number, index: number): number {
	if (index === 0) return baseSeed >>> 0;
	let value = (baseSeed + Math.imul(index, 0x9e3779b9)) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
	return (value ^ (value >>> 16)) >>> 0;
}

/** Gives common numbered titles useful defaults without discarding an authored edition name. */
function numberedTitle(title: string, kind: PuzzleKind, number: number): string {
	const base = title.trim() || kind.replace('-', ' ');
	if (/\b(?:no\.?|#)\s*\d+\s*$/i.test(base))
		return base.replace(/(\b(?:no\.?|#)\s*)\d+\s*$/i, `$1${number}`);
	return `${base} No. ${number}`;
}

/** Canonicalizes authored material so formatting changes cannot disguise an exact duplicate. */
function sourceIdentity(source: string, kind: Exclude<PuzzleKind, 'sudoku'>): string {
	return kind === 'crossword'
		? JSON.stringify(parseCrosswordClues(source).map(({ word, clue }) => [word, clue.toLowerCase()]))
		: JSON.stringify(parseWords(source).sort());
}
