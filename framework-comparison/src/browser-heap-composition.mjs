/** Disjoint V8 snapshot node-type categories; unknown future types remain visible in Other. */
export const heapCategories = [
	{ id: 'code', name: 'V8 code / metadata', types: ['code'] },
	{ id: 'internals', name: 'V8 internals / shapes', types: ['hidden', 'object shape'] },
	{
		id: 'values',
		name: 'Objects, arrays / closures',
		types: ['object', 'array', 'closure', 'regexp']
	},
	{
		id: 'strings',
		name: 'Strings / source text',
		types: ['string', 'concatenated string', 'sliced string']
	},
	{ id: 'native', name: 'Native nodes', types: ['native'] },
	{ id: 'other', name: 'Other nodes', types: [] }
];

/** Groups self-bytes without adding overlapping dominator retained sizes or inferring ownership. */
export function categorizeHeap(composition) {
	const result = Object.fromEntries(heapCategories.map(({ id }) => [id, 0]));
	for (const [type, bytes] of Object.entries(composition.selfBytesByType)) {
		if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid heap category bytes');
		const category = heapCategories.find((entry) => entry.types.includes(type));
		result[category?.id ?? 'other'] += bytes;
	}
	if (Object.values(result).reduce((sum, bytes) => sum + bytes, 0) !== composition.selfBytes)
		throw new Error('Heap categories do not reconcile to snapshot self-bytes');
	return result;
}

/** Produces additive arithmetic means from balanced snapshot rounds, retaining capture provenance. */
export function createHeapCompositionReport(run) {
	if (
		run.schemaVersion !== 1 ||
		run.kind !== 'framework-comparison-heap-composition' ||
		run.correctness?.status !== 'passed' ||
		!Number.isSafeInteger(run.sampleCount) ||
		run.sampleCount < 1 ||
		!run.participants?.length ||
		!run.createdAt ||
		!run.commit ||
		!run.browserVersion
	)
		throw new Error('Incomplete heap composition evidence');
	const totals = [];
	const means = run.participants.map((participant) => {
		if (
			!participant.name ||
			!participant.artifactHash ||
			participant.samples?.length !== run.sampleCount
		)
			throw new Error('Unbalanced heap composition evidence');
		const samples = participant.samples.map((sample) => categorizeHeap(sample.composition));
		const mean = Object.fromEntries(
			heapCategories.map(({ id }) => [
				id,
				samples.reduce((sum, sample) => sum + sample[id], 0) / samples.length
			])
		);
		totals.push(Object.values(mean).reduce((sum, bytes) => sum + bytes, 0));
		return mean;
	});
	return {
		schemaVersion: 1,
		metadata: {
			createdAt: run.createdAt,
			commit: run.commit,
			workingTreeDirty: run.workingTreeDirty,
			browserVersion: run.browserVersion,
			samplesPerFramework: run.sampleCount,
			...(run.clientDelivery ? { clientDelivery: run.clientDelivery } : {}),
			artifacts: run.participants.map(({ name, artifactHash }) => ({ name, artifactHash }))
		},
		title: 'Browser heap composition after interaction',
		unit: 'MB (decimal)',
		comment:
			'Mean post-GC snapshot self-bytes after loading an incident and completing its claim action. Each node is counted once. V8 code nodes include compiled code and metadata; internal/shape nodes are separate and are not all compiled-code metadata. Objects and strings include both application and engine-owned data. Native nodes include browser objects represented in the snapshot, not total browser process memory. These separate diagnostic captures do not partition the JSHeapUsedSize distribution above.',
		categories: run.participants.map(({ name }) => name),
		series: heapCategories.map(({ id, name }) => ({
			name,
			values: means.map((mean) => mean[id] / 1e6)
		})),
		totals: totals.map((bytes) => bytes / 1e6)
	};
}
