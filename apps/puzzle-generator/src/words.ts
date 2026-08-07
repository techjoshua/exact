import type { CrosswordClue } from './types.js';

const blockedSequences = [
	'BITCH',
	'COCK',
	'CUNT',
	'DICK',
	'FUCK',
	'PISS',
	'SHIT',
	'SLUT',
	'WHORE'
] as const;

/** Parses, normalizes, and deduplicates author-provided puzzle words. */
export function parseWords(source: string): string[] {
	return [
		...new Set(
			source
				.split(/[\s,;]+/)
				.map((word) =>
					word
						.normalize('NFKD')
						.replace(/[^a-z]/gi, '')
						.toUpperCase()
				)
				.filter(Boolean)
		)
	];
}

/**
 * Parses one crossword entry per line using the human-readable `answer - clue` format.
 * A line without a separator remains usable and receives an explicit missing-clue label.
 */
export function parseCrosswordClues(source: string): CrosswordClue[] {
	const entries = new Map<string, CrosswordClue>();
	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		const separator = line.match(/\s+(?:-|–|—)\s+/);
		const answerSource = separator ? line.slice(0, separator.index) : line;
		const word = normalizeWord(answerSource);
		if (!word || entries.has(word)) continue;
		const clue = separator ? line.slice((separator.index ?? 0) + separator[0].length).trim() : '';
		entries.set(word, { word, clue: clue || 'No clue provided' });
	}
	return [...entries.values()];
}

function normalizeWord(source: string): string {
	return source
		.normalize('NFKD')
		.replace(/[^a-z]/gi, '')
		.toUpperCase();
}

/** Returns a user-facing validation issue, or undefined when words are safe to generate. */
export function validateWords(words: readonly string[], minimum = 2): string | undefined {
	if (words.length < minimum) return `Enter at least ${minimum} different words.`;
	const short = words.find((word) => word.length < 2);
	if (short) return `“${short}” is too short; words need at least two letters.`;
	const long = words.find((word) => word.length > 24);
	if (long) return `“${long}” is longer than the 24-letter limit.`;
	const blocked = words.find(containsBlockedSequence);
	if (blocked) return `“${blocked}” contains a blocked sequence and was not used.`;
	return undefined;
}

/** Checks a letter sequence in both reading directions against the conservative safety list. */
export function containsBlockedSequence(value: string): boolean {
	const upper = value.toUpperCase();
	const reverse = [...upper].reverse().join('');
	return blockedSequences.some((blocked) => upper.includes(blocked) || reverse.includes(blocked));
}
