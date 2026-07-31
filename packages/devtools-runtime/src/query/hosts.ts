import type {
	ExactInspectionExecutionRoot,
	ExactInspectionSubscription
} from '@exactjs/devtools-protocol';

/** Cursor host key for inspection events collected in the current browser page. */
export const CLIENT_HOST = '$client';
/** Cursor host key for inspection events collected by the page's server runtime. */
export const PAGE_SERVER_HOST = '$server';

/** Decodes the bounded multi-host cursor used by merged client/server queries. */
export function splitHostCursors(cursor: string | undefined): Map<string, string> {
	if (!cursor) return new Map();
	if (cursor.startsWith('m2:')) {
		try {
			const decoded = JSON.parse(decodeURIComponent(cursor.slice(3))) as unknown;
			if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return new Map();
			return new Map(
				Object.entries(decoded)
					.filter(
						(entry): entry is [string, string] =>
							entry[0].length <= 512 && typeof entry[1] === 'string' && entry[1].length <= 512
					)
					.slice(0, 32)
			);
		} catch {
			return new Map();
		}
	}
	if (!cursor.startsWith('m:'))
		return new Map([
			[CLIENT_HOST, cursor],
			[PAGE_SERVER_HOST, cursor]
		]);
	const [, client = '', server = ''] = cursor.split(':', 3);
	return new Map([
		...(client && client !== '-' ? ([[CLIENT_HOST, decodeURIComponent(client)]] as const) : []),
		...(server && server !== '-' ? ([[PAGE_SERVER_HOST, decodeURIComponent(server)]] as const) : [])
	]);
}

/** Encodes independent host cursors deterministically. */
export function joinHostCursors(cursors: ReadonlyMap<string, string>): string {
	const sorted = [...cursors].sort(([left], [right]) => left.localeCompare(right));
	return `m2:${encodeURIComponent(JSON.stringify(Object.fromEntries(sorted)))}`;
}

/** Identifies one server execution root and the narrowed filter used to query it. */
export type ServerTarget = Readonly<{
	key: string;
	filter: ExactInspectionSubscription['filter'];
}>;

/** Selects server inspection roots addressed by a request filter. */
export function serverTargets(
	roots: readonly ExactInspectionExecutionRoot[],
	filter: ExactInspectionSubscription['filter']
): readonly ServerTarget[] {
	if (filter?.side === 'client') return [];
	const targets: ServerTarget[] = [];
	if (!filter?.binding) targets.push({ key: PAGE_SERVER_HOST, filter });
	const seen = new Set<string>();
	for (const root of roots) {
		if (!root.binding || (filter?.binding && filter.binding !== root.binding)) continue;
		if (filter?.buildKey && filter.buildKey !== root.buildKey) continue;
		if (filter?.executionRoot && filter.executionRoot !== root.executionRoot) continue;
		const key = `binding:${root.binding}:${root.buildKey}:${root.executionRoot}`;
		if (seen.has(key)) continue;
		seen.add(key);
		targets.push({
			key,
			filter: {
				...filter,
				side: 'server',
				binding: root.binding,
				buildKey: root.buildKey,
				executionRoot: root.executionRoot
			}
		});
	}
	return targets;
}
