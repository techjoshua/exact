import {
	importExactPublicPackageEntry,
	resolveExactPublicPackageEntry
} from '@exactjs/package-provenance';
import type { ExactPackageNode } from './graph.js';

/** Resolves a public package entry. */
export function resolvePublicPackageEntry(node: ExactPackageNode, subpath: string): string {
	return resolveExactPublicPackageEntry(node, subpath);
}

/** Performs the import public package entry domain operation. */
export async function importPublicPackageEntry(
	node: ExactPackageNode,
	subpath: string
): Promise<Record<string, unknown>> {
	return importExactPublicPackageEntry(node, subpath);
}
