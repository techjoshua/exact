import path from 'node:path';

const metrics = ['statements', 'branches', 'functions', 'lines'];

/** Aggregates Istanbul summaries by source owner, weighting counters rather than file percentages. */
export function summarizeFrameworkCoverage(summary, root) {
	const owners = new Map();
	const files = [];
	for (const [filename, counters] of Object.entries(summary)) {
		if (filename === 'total') continue;
		const relative = path.relative(root, filename).replaceAll('\\', '/');
		const match =
			/^(packages|framework-adapters|react-adapters|plugins|component-libraries)\/([^/]+)\/src\//.exec(
				relative
			);
		if (!match) throw new Error(`Unexpected coverage owner: ${relative}`);
		const owner = `${match[1]}/${match[2]}`;
		const measured = {};
		for (const metric of metrics) {
			const { total, covered } = counters[metric] ?? {};
			if (
				!Number.isSafeInteger(total) ||
				!Number.isSafeInteger(covered) ||
				covered < 0 ||
				covered > total
			)
				throw new Error(`Invalid ${metric} counters: ${relative}`);
			measured[metric] = { total, covered, missed: total - covered };
		}
		files.push({ filename: relative, ...measured });
		const aggregate =
			owners.get(owner) ??
			Object.fromEntries(metrics.map((metric) => [metric, { total: 0, covered: 0 }]));
		for (const metric of metrics) {
			aggregate[metric].total += measured[metric].total;
			aggregate[metric].covered += measured[metric].covered;
		}
		owners.set(owner, aggregate);
	}
	if (!files.length) throw new Error('No framework source coverage was captured');
	const total = Object.fromEntries(metrics.map((metric) => [metric, { total: 0, covered: 0 }]));
	for (const aggregate of owners.values())
		for (const metric of metrics) {
			total[metric].total += aggregate[metric].total;
			total[metric].covered += aggregate[metric].covered;
		}
	const percentages = (counters) =>
		Object.fromEntries(
			metrics.map((metric) => {
				const { total, covered } = counters[metric];
				return [
					metric,
					{
						total,
						covered,
						missed: total - covered,
						percent: total ? (100 * covered) / total : null
					}
				];
			})
		);
	return {
		measurement: 'Vitest V8 source-mapped statement, branch, function, and line counters',
		conditions: {
			measured: false,
			reason:
				'V8 does not report independent condition outcomes or MC/DC. Review compound predicates with explicit true, false, and short-circuit witnesses.'
		},
		total: percentages(total),
		owners: [...owners]
			.map(([owner, counters]) => ({ owner, ...percentages(counters) }))
			.sort((a, b) => a.owner.localeCompare(b.owner)),
		files: files.sort(
			(a, b) =>
				b.branches.missed - a.branches.missed ||
				b.statements.missed - a.statements.missed ||
				a.filename.localeCompare(b.filename)
		)
	};
}
