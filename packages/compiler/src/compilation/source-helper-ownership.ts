import path from 'node:path';
import type { ExactCompilerSession } from '../expression/project.js';

/** One session's resolved helper edges, replaced when its source owner is transformed again. */
const owners = new WeakMap<
	ExactCompilerSession,
	{
		edges: Map<string, readonly string[]>;
		pending: Promise<void>;
		generation: number;
	}
>();

function sessionOwner(session: ExactCompilerSession) {
	let owner = owners.get(session);
	if (!owner)
		owners.set(session, (owner = { edges: new Map(), pending: Promise.resolve(), generation: 0 }));
	return owner;
}

/** Serializes snapshot acquisition, installation, and its dependent compiler work. */
export async function withSourceHelperSelection<Result>(
	session: ExactCompilerSession,
	run: (nextGeneration: () => number) => Result | Promise<Result>
): Promise<Result> {
	const owner = sessionOwner(session);
	const previous = owner.pending;
	let release!: () => void;
	owner.pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await run(() => ++owner.generation);
	} finally {
		release();
	}
}

/** Retains exact native source identities without publishing helper metadata or loading modules. */
export function retainSourceHelperOwnership(
	session: ExactCompilerSession,
	filename: string,
	sources: readonly Readonly<{ sourceFile: string }>[]
): void {
	const edges = sessionOwner(session).edges;
	edges.set(
		sourceIdentity(filename),
		sources.map((source) => sourceIdentity(source.sourceFile))
	);
}

/** Selects an ordinary source only when this compiler session requires its owned executable. */
export function isExactOwnedHelperSource(
	filename: string,
	session?: ExactCompilerSession
): boolean {
	if (!session) return false;
	const identity = sourceIdentity(filename);
	for (const sources of owners.get(session)?.edges.values() ?? [])
		if (sources.includes(identity)) return true;
	return false;
}

function sourceIdentity(filename: string): string {
	const resolved = path.resolve(filename).replaceAll('\\', '/');
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
