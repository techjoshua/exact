/** Checks style diffs remain usable when a valid attribute produces many fine-grained changes. */
export function verifyWideStyleDiff({ diffBoundaryHtml }, count = 140_000) {
	const style = Array.from({ length: count }, (_, index) => '--' + index.toString(36) + ':x').join(
		';'
	);
	const plain = '<div data-exact-id="subject"></div>';
	const styled = '<div data-exact-id="subject" style="' + style + '"></div>';
	for (const removing of [false, true]) {
		const patches = diffBoundaryHtml(
			'owner',
			removing ? styled : plain,
			removing ? plain : styled,
			'element'
		);
		if (patches.every((patch) => patch.type === 'style')) {
			if (
				patches.length !== count ||
				patches.some((patch) => patch.value !== (removing ? null : 'x'))
			)
				throw new Error('Wide style diff lost a declaration');
		} else if (
			patches.length !== 1 ||
			patches[0].type !== 'prop' ||
			patches[0].name !== 'style' ||
			patches[0].value !== (removing ? null : style)
		) {
			throw new Error('Wide style diff lost its fallback attribute');
		}
	}
}

/** Checks configured inspection page sizes without a host argument-count capacity limit. */
export async function verifyWideInspectionPage({ paginateInspectionSources }, count = 140_000) {
	const values = Array.from({ length: count }, (_, index) => index);
	const page = await paginateInspectionSources(
		[
			{
				size: count,
				read: async ({ limit }) => {
					if (limit !== count) throw new Error('Inspection changed the requested page size');
					return { values };
				}
			}
		],
		{ limit: count },
		count
	);
	if (
		page.values.length !== count ||
		page.values.some((value, index) => value !== index) ||
		page.nextCursor !== undefined
	)
		throw new Error('Wide inspection page lost values or ordering');
	let reads = 0;
	let cursorReads = 0;
	const captured = await paginateInspectionSources(
		[
			{
				read: async () => ({
					get values() {
						return ++reads === 1 ? ['accepted'] : ['unchecked', 'extra'];
					},
					get nextCursor() {
						cursorReads++;
						return undefined;
					}
				})
			}
		],
		{ limit: 1 },
		1
	);
	if (
		reads !== 1 ||
		cursorReads !== 1 ||
		captured.values.length !== 1 ||
		captured.values[0] !== 'accepted'
	)
		throw new Error('Inspection published page data it did not validate');
}

/** Checks public continuation dispatch, repeated invocation and cleanup with many boundary keys. */
export async function verifyWideHydrationOrdering(
	{ createExactClient },
	document,
	count = 140_000
) {
	const container = document.createElement('main');
	let requests = 0;
	const observations = [];
	const client = createExactClient(container, {
		endpoint: '/__exact',
		batch: false,
		onOperation: (observation) => observations.push(observation),
		continuations: {
			save: {
				id: 'save',
				componentId: 'wide:save',
				kind: 'task',
				readiness: 'nonblocking',
				dependencies: [],
				stateReads: [],
				stateWrites: [],
				publicContexts: [],
				serverContexts: [],
				contextWrites: [],
				boundaries: Array.from({ length: count }, (_, index) => 'boundary' + index)
			}
		},
		fetch: async () => {
			requests++;
			return {
				ok: true,
				status: 200,
				json: async () => ({ ok: true, type: 'invoke', id: 'save', value: 'complete' })
			};
		}
	});
	try {
		for (let index = 1; index <= 2; index++) {
			await client.invokeTask('save');
			if (
				requests !== index ||
				observations.length !== index ||
				observations.at(-1).result.value !== 'complete' ||
				observations.at(-1).stale
			)
				throw new Error('Wide continuation did not dispatch subsequent work');
		}
	} finally {
		client.dispose();
	}
}

/** Visits finite owners and retained remote offsets without an unrelated fixed source-page cutoff. */
export async function verifyFiniteInspectionSources({ paginateInspectionSources }, count = 256) {
	for (const trailingValue of [false, true]) {
		const sources = Array.from({ length: count }, () => ({ read: async () => ({ values: [] }) }));
		if (trailingValue) sources.push({ read: async () => ({ values: ['tail'] }) });
		const page = await paginateInspectionSources(sources, { limit: 1 }, 1);
		if (
			JSON.stringify(page.values) !== JSON.stringify(trailingValue ? ['tail'] : []) ||
			page.nextCursor !== undefined
		)
			throw new Error('Inspection dropped a finite owner');
	}
	const source = {
		async read({ cursor }) {
			const index = cursor === undefined ? 0 : Number.parseInt(cursor, 36);
			return {
				values: [index],
				...(index < count ? { nextCursor: (index + 1).toString(36) } : {})
			};
		}
	};
	const page = await paginateInspectionSources(
		[source],
		{ cursor: count.toString(36), limit: 1 },
		1
	);
	if (page.values.length !== 1 || page.values[0] !== count || page.nextCursor !== undefined)
		throw new Error('Inspection lost a retained finite remote offset');
}
