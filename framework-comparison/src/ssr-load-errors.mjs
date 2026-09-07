/** Keeps bounded failure evidence without retaining response bodies or one record per request. */
export function createLoadErrorLog() {
	const counts = new Map();
	const samples = [];
	let total = 0;
	return {
		record(details) {
			total++;
			const code = counts.has(details.code) || counts.size < 32 ? details.code : 'OTHER';
			counts.set(code, (counts.get(code) ?? 0) + 1);
			if (samples.length < 32) samples.push(details);
		},
		snapshot() {
			return {
				total,
				counts: Object.fromEntries(counts),
				samples: [...samples],
				omittedSamples: total - samples.length
			};
		}
	};
}
