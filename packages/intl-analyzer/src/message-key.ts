import { createHash } from 'node:crypto';

/** Creates one readable content-addressed catalog key during trusted build analysis. */
export function createIntlMessageKey(canonicalTranslation: string, name?: string): string {
	const digest = digestIntlContract(canonicalTranslation);
	const prefix = name && intlMessageNamePrefix(name);
	return prefix ? `${prefix}_${digest}` : digest;
}

/** Creates the opaque identity used to intern one reusable execution contract. */
export function createIntlExecutionContractHash(canonicalContract: string): string {
	return digestIntlContract(canonicalContract);
}

/** Normalizes an authored Unicode message name for readable XLIFF identifiers. */
export function intlMessageNamePrefix(name: string): string {
	const normalized = name
		.normalize('NFC')
		.trim()
		.replace(/[^\p{L}\p{N}._-]+/gu, '-')
		.replace(/[-_.]{2,}/gu, '-')
		.replace(/^[-_.]+|[-_.]+$/gu, '');
	return [...normalized].slice(0, 64).join('');
}

function digestIntlContract(value: string): string {
	return createHash('sha256').update(value.normalize('NFC'), 'utf8').digest('base64url');
}
