import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import prettierConfig from '../../prettier.config.mjs';
import { createHeapCompositionReport } from '../../framework-comparison/src/browser-heap-composition.mjs';

const [input, output = 'apps/docs/src/data/performance-heap-report.json'] = process.argv.slice(2);
if (!input)
	throw new Error('Usage: publish-docs-heap-report.mjs <browser-heap.json> [output.json]');
const report = createHeapCompositionReport(JSON.parse(await readFile(input, 'utf8')));
await writeFile(
	output,
	await format(JSON.stringify(report), { ...prettierConfig, parser: 'json' })
);
console.log(output);
