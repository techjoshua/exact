import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workspace = path.resolve(import.meta.dirname, '..');
const corpus = JSON.parse(
	await readFile(
		path.join(workspace, 'packages/react-compatibility/ordinary-package-corpus.json'),
		'utf8'
	)
);
const lock = JSON.parse(await readFile(path.join(workspace, 'package-lock.json'), 'utf8'));
const allowedResults = new Set([
	'pass',
	'fail',
	'covered',
	'resolved',
	'not-tested',
	'not-applicable',
	'blocked'
]);
const installed = new Set();

for (const [location, manifest] of Object.entries(lock.packages ?? {})) {
	if (!manifest?.version) continue;
	let packageName = manifest.name;
	if (!packageName) {
		const normalized = location.replaceAll('\\', '/');
		const marker = normalized.lastIndexOf('node_modules/');
		if (marker < 0) continue;
		const remainder = normalized.slice(marker + 'node_modules/'.length).split('/');
		packageName = remainder[0].startsWith('@') ? remainder.slice(0, 2).join('/') : remainder[0];
	}
	installed.add(`${packageName}@${manifest.version}`);
}

if (corpus.minimumPackages < 100 || corpus.packages.length < corpus.minimumPackages) {
	throw new Error(
		`React package corpus requires at least 100 records; found ${corpus.packages.length}`
	);
}
const identities = new Set();
const expanded = [];
for (const entry of corpus.packages) {
	const identity = `${entry.package}@${entry.version}`;
	if (identities.has(identity))
		throw new Error(`Duplicate React package corpus record: ${identity}`);
	identities.add(identity);
	const results = {
		...(corpus.resultProfiles[entry.resultProfile] ?? {}),
		...(entry.results ?? {})
	};
	for (const field of corpus.resultFields) {
		if (!allowedResults.has(results[field]))
			throw new Error(`${identity} has no valid ${field} result`);
	}
	if (['pass', 'covered', 'resolved'].includes(results.import) && !installed.has(identity)) {
		throw new Error(
			`React package corpus claims import coverage for an uninstalled version: ${identity}`
		);
	}
	expanded.push({ package: entry.package, version: entry.version, results });
}

const resultCounts = Object.fromEntries(
	corpus.resultFields.map((field) => [
		field,
		Object.fromEntries(
			[...allowedResults]
				.map((status) => [
					status,
					expanded.filter((entry) => entry.results[field] === status).length
				])
				.filter(([, count]) => count > 0)
		)
	])
);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			suite: 'ordinary-react-package-corpus',
			packageCount: expanded.length,
			resultFields: corpus.resultFields,
			resultCounts
		},
		null,
		2
	)
);
