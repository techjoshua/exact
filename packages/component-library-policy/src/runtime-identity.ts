import type { ExactComponentAuthorizationManifest } from './contracts.js';
import { readFile } from 'node:fs/promises';

/** Runtime-safe authorization identity projected from a private build manifest. */
export type ExactComponentAuthorizationRuntimeIdentity = Readonly<{
	protocol: 1;
	buildKey: string;
	fingerprint: string;
}>;

/** Projects the only component-authorization fields permitted to cross into runtime artifacts. */
export function exactComponentAuthorizationIdentity(
	manifest: ExactComponentAuthorizationManifest
): ExactComponentAuthorizationRuntimeIdentity {
	return Object.freeze({
		protocol: manifest.protocol,
		buildKey: manifest.buildKey,
		fingerprint: manifest.fingerprint
	});
}

/** Reads and validates one server-build manifest before projecting its paired artifact identity. */
export async function readExactComponentAuthorizationIdentity(
	manifestPath: string
): Promise<ExactComponentAuthorizationRuntimeIdentity> {
	let value: unknown;
	try {
		value = JSON.parse(await readFile(manifestPath, 'utf8'));
	} catch (error) {
		throw new Error(
			`Unable to read component authorization manifest ${manifestPath}: ${errorMessage(error)}`
		);
	}
	if (!validManifest(value))
		throw new Error(`Invalid protocol-1 component authorization manifest ${manifestPath}`);
	return exactComponentAuthorizationIdentity(value);
}

function validManifest(value: unknown): value is ExactComponentAuthorizationManifest {
	if (!record(value)) return false;
	return (
		value.protocol === 1 &&
		boundedString(value.buildKey, 512) &&
		boundedString(value.fingerprint, 512) &&
		boundedString(value.policyHash, 512) &&
		value.markerProtocol === 1 &&
		Array.isArray(value.packages) &&
		value.packages.length <= 10_000 &&
		Array.isArray(value.omittedEnhancements) &&
		value.omittedEnhancements.length <= 10_000
	);
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
