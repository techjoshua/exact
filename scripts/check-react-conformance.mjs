import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareConformanceTraces } from '../packages/react-compatibility/dist/index.js';
import { outputDirectory } from './react-conformance/context.mjs';
import { runReference } from './react-conformance/execution.mjs';
import {
	inventorySize,
	validateInventory,
	validatePackageFixtureCatalog,
	validatePhaseRecords,
	validateVersion
} from './react-conformance/records.mjs';
import {
	validateCompatibilityPhases,
	validateImplementedExports
} from './react-conformance/phases.mjs';

mkdirSync(outputDirectory, { recursive: true });

const [reference18, reference19] = await Promise.all([
	runReference('@exactjs/react-reference-18'),
	runReference('@exactjs/react-reference-19')
]);

validateVersion(reference18, '18.3');
validateVersion(reference19, '19.2');
validateInventory(reference18);
validateInventory(reference19);
validatePackageFixtureCatalog();
validatePhaseRecords();
await validateCompatibilityPhases();
await validateImplementedExports(reference18, 18);
await validateImplementedExports(reference19, 19);

const differences = compareConformanceTraces(reference18, reference19);
if (differences.length) {
	throw new Error(
		`React reference scenarios diverged:\n${differences.map((value) => `  ${value.path}: ${JSON.stringify(value.expected)} != ${JSON.stringify(value.actual)}`).join('\n')}`
	);
}

writeFileSync(
	path.join(outputDirectory, 'reference-18.json'),
	`${JSON.stringify(reference18, null, 2)}\n`
);
writeFileSync(
	path.join(outputDirectory, 'reference-19.json'),
	`${JSON.stringify(reference19, null, 2)}\n`
);
console.log(`React ${reference18.version} and ${reference19.version} reference traces agree`);
console.log(
	`Capability inventory covers ${inventorySize(reference18)} React 18 exports and ${inventorySize(reference19)} React 19 exports`
);
