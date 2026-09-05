import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
	throw new Error('Usage: node generate-chat-tables.mjs <phase.json> <output.md>');
}

const report = JSON.parse(await readFile(inputPath, 'utf8'));
const labels = new Map([
	['exact', 'eXact'],
	['exact-controlled', 'eXact'],
	['react', 'React'],
	['react-controlled', 'React'],
	['sveltekit', 'SvelteKit'],
	['sveltekit-controlled', 'SvelteKit'],
	['nuxt', 'Nuxt'],
	['nuxt-controlled', 'Nuxt'],
	['tanstack-start', 'TanStack Start'],
	['tanstack-start-controlled', 'TanStack Start']
]);
const frameworkOrder = ['eXact', 'React', 'SvelteKit', 'Nuxt', 'TanStack Start'];
const frameworkSuites = report.suites.filter(({ table }) =>
	table.suite.startsWith('framework-comparison-')
);
const formatNumber = (value) => {
	if (!Number.isFinite(value)) return String(value);
	if (Number.isInteger(value)) return String(value);
	const magnitude = Math.abs(value);
	const decimals = magnitude >= 100 ? 1 : magnitude >= 1 ? 3 : 4;
	return value
		.toFixed(decimals)
		.replace(/\.0+$|(?<=\.[0-9]*?)0+$/u, '')
		.replace(/\.$/u, '');
};
const sections = [
	`# Phase ${report.phase} complete framework metrics`,
	'',
	'Frameworks are columns in the fixed order eXact, React, SvelteKit, Nuxt, and TanStack Start. Every value cell is mean / p50 / p75 / p95 / p99 when the raw population exposes a mean; older summaries retain p50 / p75 / p95 / p99.'
];

for (const { table } of frameworkSuites) {
	const title = table.suite.replace('framework-comparison-', '').replaceAll('-', ' ');
	const metrics = [
		...new Set(table.participants.flatMap((participant) => Object.keys(participant.metrics)))
	].sort();
	const unit = (metric) =>
		table.participants.map((participant) => participant.metrics[metric]?.unit).find(Boolean) ??
		'value';
	const participants = new Map(
		table.participants.map((participant) => [
			labels.get(participant.name) ?? participant.name,
			participant
		])
	);
	sections.push(
		'',
		`## ${title}`,
		'',
		`| Metric | ${frameworkOrder.join(' | ')} |`,
		`|---|${frameworkOrder.map(() => '---:').join('|')}|`
	);
	for (const metric of metrics) {
		const cells = frameworkOrder.map((framework) => {
			const value = participants.get(framework)?.metrics[metric];
			return value
				? [...(Number.isFinite(value.mean) ? ['mean'] : []), 'p50', 'p75', 'p95', 'p99']
						.map((percentile) => formatNumber(value[percentile]))
						.join(' / ')
				: '—';
		});
		sections.push(`| ${metric} (${unit(metric)}) | ${cells.join(' | ')} |`);
	}
}

await writeFile(outputPath, `${sections.join('\n')}\n`);
