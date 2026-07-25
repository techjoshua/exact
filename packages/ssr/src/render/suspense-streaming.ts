/** Describes one complete marker range in rendered HTML. */
type SuspenseHtmlRange = {
	readonly id: string;
	readonly identity: string;
	readonly start: number;
	readonly end: number;
	readonly html: string;
};

/** Describes a boundary replacement that can reproduce the final render from the shell. */
export type SuspenseStreamReplacement = {
	readonly id: string;
	readonly html: string;
};

/**
 * Plans the smallest outermost Suspense replacements that transform a shell into settled HTML.
 *
 * Returns `undefined` when boundary-local replacements cannot explain every difference. The
 * caller must then replace the root so updates outside Suspense are never silently omitted.
 */
export function planSuspenseStreamReplacements(
	shell: string,
	settled: string
): readonly SuspenseStreamReplacement[] | undefined {
	if (shell === settled) return [];
	const shellRanges = suspenseRanges(shell);
	const settledByIdentity = new Map(
		suspenseRanges(settled).map((range) => [range.identity, range] as const)
	);
	const changed = shellRanges.filter((range) => {
		const finalRange = settledByIdentity.get(range.identity);
		return !!finalRange && finalRange.html !== range.html;
	});
	const outermost = changed.filter(
		(range) =>
			!changed.some(
				(candidate) =>
					candidate !== range && candidate.start < range.start && candidate.end > range.end
			)
	);
	let patched = shell;
	for (const range of [...outermost].sort((left, right) => right.start - left.start)) {
		const finalRange = settledByIdentity.get(range.identity)!;
		patched = patched.slice(0, range.start) + finalRange.html + patched.slice(range.end);
	}
	if (patched !== settled) return undefined;
	return outermost.map((range) =>
		Object.freeze({
			id: range.id,
			html: settledByIdentity.get(range.identity)!.html
		})
	);
}

function suspenseRanges(html: string): SuspenseHtmlRange[] {
	const marker = /<!--(\/?)exact:([^>]+)-->/g;
	const open = new Map<string, { readonly start: number; readonly id: string }>();
	const ranges: SuspenseHtmlRange[] = [];
	for (let match = marker.exec(html); match; match = marker.exec(html)) {
		const closing = match[1] === '/';
		const id = match[2]!;
		const identity = suspenseIdentity(id);
		if (!identity) continue;
		if (!closing) {
			open.set(identity, { start: match.index, id });
			continue;
		}
		const start = open.get(identity);
		if (!start) continue;
		open.delete(identity);
		const end = marker.lastIndex;
		ranges.push({
			id: start.id,
			identity,
			start: start.start,
			end,
			html: html.slice(start.start, end)
		});
	}
	return ranges;
}

function suspenseIdentity(id: string): string | undefined {
	const match = /^suspense-(?:content|fallback)(:.*)$/.exec(id);
	return match?.[1];
}
