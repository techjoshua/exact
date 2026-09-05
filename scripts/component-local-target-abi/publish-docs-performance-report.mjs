import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { format } from 'prettier';
import prettierConfig from '../../prettier.config.mjs';

const [inputArgument, outputArgument = 'apps/docs/src/data/performance-report.json'] =
	process.argv.slice(2);
if (!inputArgument)
	throw new Error('Usage: publish-docs-performance-report.mjs <compact-report.json> [output.json]');

const input = resolve(inputArgument);
const output = resolve(outputArgument);
const report = JSON.parse(await readFile(input, 'utf8'));
validateReport(report);
await mkdir(dirname(output), { recursive: true });
await writeFile(
	output,
	await format(JSON.stringify(report), { ...prettierConfig, parser: 'json' })
);
console.log(output);

/** Rejects incomplete or invented summaries before they enter the public docs artifact. */
function validateReport(report) {
	if (!report || report.schemaVersion !== 1) throw new Error('Unsupported docs performance schema');
	for (const key of ['commit', 'createdAt', 'browserSamples', 'startupSamples', 'ssrSamples'])
		if (report.metadata?.[key] === undefined)
			throw new Error(`Docs performance report omitted metadata.${key}`);
	const charts = [
		...(report.browserCharts ?? []),
		...(report.server?.saturationCharts ?? []),
		...(report.server?.equalPayloadCharts ?? []),
		report.server?.ordinary,
		report.server?.sequential,
		report.server?.renderOnly,
		report.server?.retention,
		report.diagnostics?.bun,
		report.diagnostics?.preloaded
	].filter(Boolean);
	if (!charts.length) throw new Error('Docs performance report contains no distributions');
	for (const chart of charts) {
		if (!chart.title || !chart.unit || !chart.comment || !chart.series?.length)
			throw new Error(`Incomplete docs performance chart ${chart.title ?? '<unknown>'}`);
		for (const series of chart.series) {
			for (const statistic of ['mean', 'p50', 'p75', 'p95', 'p99'])
				if (!Number.isFinite(series.stats?.[statistic]))
					throw new Error(`${chart.title}/${series.name} omitted finite ${statistic}`);
		}
	}
}
