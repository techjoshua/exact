import path from 'node:path';
import type { NativeCompilerHelperPublication } from '../native/process-contracts.js';
import type { ExactCompilerSession } from '../expression/project.js';

/** One session's resolved helper edges, replaced when its source owner is transformed again. */
const owners = new WeakMap<
	ExactCompilerSession,
	{
		edges: Map<
			string,
			readonly Readonly<{
				sourceFile: string;
				publication?: readonly NativeCompilerHelperPublication[];
			}>[]
		>;
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
	sources: readonly Readonly<{
		sourceFile: string;
		publication?: readonly NativeCompilerHelperPublication[];
	}>[]
): void {
	const edges = sessionOwner(session).edges;
	edges.set(
		sourceIdentity(filename),
		sources.map((source) => ({
			sourceFile: sourceIdentity(source.sourceFile),
			publication: source.publication
		}))
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
		if (sources.some((source) => source.sourceFile === identity)) return true;
	return false;
}

/** Returns only native-issued edge descriptions; callers must supply fresh owner source context. */
export function sourceHelperPlanningContext(
	session: ExactCompilerSession,
	filename: string
): readonly NativeCompilerHelperPublication[] {
	const identity = sourceIdentity(filename);
	const result: NativeCompilerHelperPublication[] = [];
	for (const sources of owners.get(session)?.edges.values() ?? [])
		for (const source of sources)
			if (source.sourceFile === identity) result.push(...(source.publication ?? []));
	return result;
}

/** Discards source-only helper planning when the owning native session is reset or released. */
export function clearSourceHelperOwnership(session: ExactCompilerSession): void {
	owners.get(session)?.edges.clear();
}

function sourceIdentity(filename: string): string {
	const resolved = path.resolve(filename).replaceAll('\\', '/');
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
