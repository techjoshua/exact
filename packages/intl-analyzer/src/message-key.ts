import { createHash } from 'node:crypto';

/** Creates one protocol-1 catalog key during trusted build analysis. */
export function createIntlMessageKey(canonicalSource: string): string {
	return `m1_${createHash('sha256').update(canonicalSource.normalize('NFC'), 'utf8').digest('base64url')}`;
}
