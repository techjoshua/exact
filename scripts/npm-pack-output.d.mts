/** Validated file inventory shared by release checks and package-consumer integration tests. */
export interface NpmPackInventory {
	name: string;
	entryCount: number;
	files: Array<{ path: string }>;
	filename?: string;
}

/** Accepts one named npm 11/12 inventory; rejects missing, ambiguous, or malformed responses. */
export function parseNpmPackOutput(output: string, name: string): NpmPackInventory;
