import { createHash } from 'node:crypto';

/** Hashes deterministic JSON using SHA-256 base64url without exposing raw inputs. */
export function canonicalHash(value: unknown): string {
	return createHash('sha256').update(canonicalJson(value)).digest('base64url');
}

/** Serializes JSON-compatible policy data with recursively sorted object keys. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, canonicalValue(entry)])
	);
}
