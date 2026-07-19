import { createHash } from 'node:crypto';

/** Creates a deterministic collision-resistant id for compiler/runtime protocol keys. */
export function stableId(...parts: string[]): string {
	const input = parts.join(':');
	return `x${createHash('sha256').update(input).digest('base64url').slice(0, 22)}`;
}
