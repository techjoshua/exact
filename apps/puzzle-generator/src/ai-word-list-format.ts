import type { PuzzleKind } from './types.js';
import { validateWords } from './words.js';

/** Puzzle kinds for which the local language model can author source material. */
export type AiPuzzleKind = Exclude<PuzzleKind, 'sudoku'>;

/** Returns the constrained JSON schema used for local model output. */
export function aiWordListSchema(kind: AiPuzzleKind): string {
	const items =
		kind === 'crossword'
			? {
					type: 'object',
					properties: {
						word: { type: 'string' },
						clue: { type: 'string' }
					},
					required: ['word', 'clue'],
					additionalProperties: false
				}
			: { type: 'string' };
	return JSON.stringify({
		type: 'object',
		properties: {
			[kind === 'crossword' ? 'entries' : 'words']: {
				type: 'array',
				items,
				minItems: 8,
				maxItems: 12
			}
		},
		required: [kind === 'crossword' ? 'entries' : 'words'],
		additionalProperties: false
	});
}

/** Builds a compact instruction tuned for printable puzzle source material. */
export function aiWordListPrompt(topic: string, kind: AiPuzzleKind): string {
	const output =
		kind === 'crossword'
			? 'Return JSON with an entries array. Every entry must have a word and a concise, accurate clue.'
			: 'Return JSON with a words array of strings.';
	return `Create 10 unique ${kind === 'crossword' ? 'crossword answers and clues' : 'word-search words'} about "${topic.trim()}". Use familiar answers of 3-12 English letters. Remove spaces, punctuation, and accents from answers. Avoid proper nouns unless essential, offensive language, and near-duplicates. ${kind === 'crossword' ? 'Choose answers that share letters so they can form one connected crossword. Do not put the answer itself in its clue. ' : ''}${output} Output JSON only.`;
}

/**
 * Validates structured model output and converts it to the app's editable text format.
 * Invalid or unsafe generations are rejected before they can replace authored input.
 */
export function formatAiWordListResponse(source: string, kind: AiPuzzleKind): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		throw new Error('The local model returned malformed data. Try generating again.');
	}
	if (!isRecord(parsed)) throw new Error('The local model returned an unexpected result.');

	if (kind === 'word-search') {
		if (!Array.isArray(parsed.words))
			throw new Error('The local model did not return a word list.');
		const words = uniqueWords(parsed.words);
		validateAiWords(words);
		return words.join('\n');
	}

	if (!Array.isArray(parsed.entries))
		throw new Error('The local model did not return crossword entries.');
	const entries = new Map<string, string>();
	for (const candidate of parsed.entries) {
		if (
			!isRecord(candidate) ||
			typeof candidate.word !== 'string' ||
			typeof candidate.clue !== 'string'
		)
			continue;
		const word = normalizeAnswer(candidate.word);
		const clue = candidate.clue.trim().replace(/\s+/g, ' ');
		if (word && clue && clue.length <= 160 && !entries.has(word)) entries.set(word, clue);
	}
	validateAiWords([...entries.keys()]);
	return [...entries].map(([word, clue]) => `${word} - ${clue}`).join('\n');
}

function uniqueWords(candidates: readonly unknown[]): string[] {
	return [
		...new Set(
			candidates.flatMap((candidate) =>
				typeof candidate === 'string' && normalizeAnswer(candidate)
					? [normalizeAnswer(candidate)]
					: []
			)
		)
	];
}

function validateAiWords(words: readonly string[]): void {
	if (words.length < 6)
		throw new Error('The local model returned too few usable words. Try a broader topic.');
	const issue = validateWords(words, 6);
	if (issue) throw new Error(`The local model response was rejected: ${issue}`);
}

function normalizeAnswer(source: string): string {
	return source
		.normalize('NFKD')
		.replace(/[^a-z]/gi, '')
		.toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
