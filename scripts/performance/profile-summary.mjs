/**
 * Attributes CPU sample counts to explicit monotonic phase windows. Samples outside the
 * windows are excluded. Inclusive rows count each function once per stack, including recursion;
 * rows overlap and must not be summed. Sampling counts are attribution, not benchmark latency.
 */
export function summarizeProfile(profile, windows, describe = (frame) => frame) {
	const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
	const parents = new Map();
	for (const node of profile.nodes)
		for (const child of node.children ?? []) parents.set(child, node.id);
	const phases = new Map();
	let time = profile.startTime;
	let cursor = 0;
	for (let index = 0; index < profile.samples.length; index++) {
		time += profile.timeDeltas[index];
		while (cursor < windows.length && time >= windows[cursor].end) cursor++;
		const window = windows[cursor];
		if (!window || time < window.start) continue;
		let phase = phases.get(window.phase);
		if (!phase) phases.set(window.phase, (phase = { samples: 0, rows: new Map() }));
		phase.samples++;
		const seen = new Set();
		let id = profile.samples[index];
		let self = true;
		while (id !== undefined) {
			const frame = describe(nodes.get(id).callFrame);
			const key = JSON.stringify(frame);
			let row = phase.rows.get(key);
			if (!row) phase.rows.set(key, (row = { ...frame, self: 0, inclusive: 0 }));
			if (self) row.self++;
			if (!seen.has(key)) row.inclusive++;
			seen.add(key);
			self = false;
			id = parents.get(id);
		}
	}
	return Object.fromEntries(
		[...phases].map(([name, phase]) => [
			name,
			{
				samples: phase.samples,
				rows: [...phase.rows.values()].sort((a, b) => b.self - a.self)
			}
		])
	);
}
