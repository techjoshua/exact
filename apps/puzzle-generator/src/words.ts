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
