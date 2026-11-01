import type { Child, Logger } from '@exactjs/core';
import type { ExactPatch } from '@exactjs/core/framework/operation-protocol';

type ListMarkerApi = {
	encodeExactMarkerPart: typeof import('@exactjs/core').encodeExactMarkerPart;
	applyPatches(
		container: Element,
		patches: readonly ExactPatch[],
		options?: { logger?: Logger }
	): boolean;
};

/** Defines list-key transitions that must preserve identity and reject invalid batches atomically. */
export const listMarkerCases = [
	'compact removal',
	'reinsert removed key',
	'encoded removal',
	'encoded insertion',
	'encoded sequence',
	'empty anchor',
	'empty insertion',
	'missing empty removal',
	'wrong fragment'
] as const;

/** Checks canonical raw keys through both legacy and compact item marker formats. */
export function verifyListMarkerKeys(
	api: ListMarkerApi,
	document: Document,
	cases: readonly (typeof listMarkerCases)[number][] = listMarkerCases
): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('List marker keys: ' + message);
	};
	for (const compact of [false, true])
		for (const scenario of cases) {
			const item = (key: string) => {
				const marker = `${compact ? 'i' : 'exact:item:list'}:${api.encodeExactMarkerPart(key)}`;
				return `<!--${marker}--><span data-label="${api.encodeExactMarkerPart(key)}">row</span><!--/${marker}-->`;
			};
			const keys =
				scenario === 'compact removal'
					? ['a', 'b']
					: scenario === 'encoded removal' || scenario === 'encoded sequence'
						? ['--', '~2d2d']
						: scenario === 'encoded insertion'
							? ['--']
							: scenario === 'empty anchor'
								? ['', 'b']
								: ['a'];
			const root = document.createElement('div');
			root.innerHTML = `<!--exact:list-->${keys.map(item).join('')}<!--/exact:list-->`;
			const original = root.innerHTML;
			const retained = new Map(
				keys.map((key) => [
					key,
					root.querySelector(`[data-label="${api.encodeExactMarkerPart(key)}"]`)
				])
			);
			const list = (
				op: 'insert' | 'remove' | 'move',
				key: string,
				extra: { before?: string; html?: string } = {}
			): ExactPatch => ({ type: 'list', id: 'list', op, key, ...extra });
			let patches: ExactPatch[];
			let expected: string[];
			let valid = true;
			switch (scenario) {
				case 'reinsert removed key':
					patches = [list('remove', 'a'), list('insert', 'a', { html: item('a') })];
					expected = ['a'];
					retained.delete('a');
					break;
				case 'compact removal':
					patches = [list('remove', 'a')];
					expected = ['b'];
					break;
				case 'encoded removal':
					patches = [list('remove', '~2d2d')];
					expected = ['--'];
					break;
				case 'encoded insertion':
					patches = [list('insert', '~2d2d', { html: item('~2d2d') })];
					expected = ['--', '~2d2d'];
					break;
				case 'encoded sequence':
					patches = [list('remove', '~2d2d'), list('move', '--')];
					expected = ['--'];
					break;
				case 'empty anchor':
					patches = [list('insert', 'c', { before: '', html: item('c') })];
					expected = ['c', '', 'b'];
					break;
				case 'empty insertion':
					patches = [list('insert', '', { html: item('') })];
					expected = ['a', ''];
					break;
				case 'missing empty removal':
					patches = [list('remove', 'a'), list('remove', '')];
					expected = keys;
					valid = false;
					break;
				case 'wrong fragment':
					patches = [list('insert', '~2d2d', { html: item('--') })];
					expected = keys;
					valid = false;
					break;
			}
			check(
				api.applyPatches(root, patches, {
					logger: { log() {} }
				}) === valid,
				scenario + ' completion'
			);
			const labels = Array.from(root.querySelectorAll('[data-label]'), (node) =>
				node.getAttribute('data-label')
			);
			check(
				JSON.stringify(labels) === JSON.stringify(expected.map(api.encodeExactMarkerPart)),
				scenario + ' ordering'
			);
			for (const key of expected) {
				if (!retained.has(key)) continue;
				check(
					root.querySelector(`[data-label="${api.encodeExactMarkerPart(key)}"]`) ===
						retained.get(key),
					scenario + ' retained identity'
				);
			}
			if (!valid) check(root.innerHTML === original, scenario + ' rejects before mutation');
			else if (scenario === 'reinsert removed key')
				check(
					api.applyPatches(root, [list('move', 'a')], { logger: { log() {} } }),
					scenario + ' next interaction'
				);
		}
}

type MarkerEncodingApi = Pick<
	typeof import('@exactjs/core'),
	'encodeExactMarkerPart' | 'decodeExactMarkerPart'
>;

/** Checks empty data and authored escape-looking strings remain distinct in the marker codec. */
export function verifyMarkerEncoding(api: MarkerEncodingApi): void {
	const keys = ['', '~', '--', '~2d2d', 'a:b', '🔥', 'plain'];
	const encoded = keys.map(api.encodeExactMarkerPart);
	if (
		new Set(encoded).size !== keys.length ||
		encoded.some((token, index) => api.decodeExactMarkerPart(token) !== keys[index])
	)
		throw new Error('Marker encoding lost authored key identity');
	for (const token of ['~0', '~xz', 'plain'])
		if (api.decodeExactMarkerPart(token) !== token)
			throw new Error('Marker decoder changed unencoded data');
}

type MarkerSnapshotApi = {
	createCompiledKeyedChildReceipt?(value: string, key: string): Child;
	renderKeyedListSnapshot(options: {
		listId: string;
		items: readonly string[];
		key(item: string): string;
		render(item: string): Child;
	}): Promise<{ html: string; innerHtml: string; items: Array<{ key: string; html: string }> }>;
	parseKeyedListSnapshotHtml(
		listId: string,
		html: string
	): { items: Array<{ key: string; html: string }> } | undefined;
	diffKeyedListItems(
		listId: string,
		previous: readonly { key: string; html: string }[],
		next: readonly { key: string; html: string }[]
	): ExactPatch[];
};

type MarkerSnapshots = {
	html: string;
	patches: ExactPatch[];
	text: string;
	retainedText: readonly string[];
};

/** Produces real SSR snapshot and diff output for the browser's list-identity acceptance. */
export async function markerKeySnapshots(
	api: MarkerSnapshotApi,
	nested = false
): Promise<MarkerSnapshots> {
	const previous = nested ? ['a', 'b', 'inner'] : ['', '~', '--', '~2d2d', 'a:b', '🔥'];
	const next = nested ? ['a', 'inner', 'new'] : ['🔥', '', '~2d2d', 'new', '~', '--'];
	const keyedChild = api.createCompiledKeyedChildReceipt;
	if (nested && !keyedChild) throw new Error('Missing nested marker fixture factory');
	const snapshot = (items: readonly string[]) =>
		api.renderKeyedListSnapshot({
			listId: 'list',
			items,
			key: (key) => key,
			render: (key) => (nested && keyedChild ? keyedChild(`row:${key}`, 'inner') : `row:${key}`)
		});
	const before = await snapshot(previous);
	const after = await snapshot(next);
	for (const [rendered, keys] of [
		[before, previous],
		[after, next]
	] as const) {
		const parsed = api.parseKeyedListSnapshotHtml('list', rendered.innerHtml);
		if (JSON.stringify(parsed?.items.map((item) => item.key)) !== JSON.stringify(keys))
			throw new Error('SSR snapshot parsing lost marker key identity');
	}
	const patches = api.diffKeyedListItems('list', before.items, after.items);
	if (nested)
		patches.push(
			{ type: 'list', id: 'list', op: 'move', key: 'inner', before: 'a' },
			{ type: 'list', id: 'list', op: 'move', key: 'inner', before: 'new' }
		);
	return {
		html: before.html,
		patches,
		text: next.map((key) => `row:${key}`).join(''),
		retainedText: before.items
			.filter((item) =>
				after.items.some((next) => next.key === item.key && next.html === item.html)
			)
			.map((item) => `row:${item.key}`)
	};
}

/** Applies actual SSR snapshot diffs while keeping every retained keyed text node. */
export function verifyMarkerSnapshots(
	api: ListMarkerApi,
	document: Document,
	snapshots: MarkerSnapshots
): void {
	const root = document.createElement('div');
	root.innerHTML = snapshots.html;
	const retained = Array.from(root.childNodes).filter(
		(node) => node.nodeType === 3 && snapshots.retainedText.includes(node.textContent ?? '')
	);
	if (retained.length !== snapshots.retainedText.length)
		throw new Error('Missing SSR keyed text nodes');
	if (!api.applyPatches(root, snapshots.patches, { logger: { log() {} } }))
		throw new Error('SSR marker diff batch rejected');
	if (root.textContent !== snapshots.text)
		throw new Error(
			`SSR marker diff ordering: expected ${snapshots.text}, received ${root.textContent}`
		);
	if (retained.some((node) => node.parentNode !== root))
		throw new Error('SSR marker diff removed unchanged keyed nodes');
}
