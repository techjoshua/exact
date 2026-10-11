/** Parses Go statement coverage, preserving uncovered source ranges for targeted review. */
export function summarizeNativeCoverage(profile) {
	// Explicit coverpkg tests can report the same package's blocks once per test executable.
	// Normalize those counters before weighting statements so the denominator is source-owned.
	const lines = mergeNativeCoverageProfiles([profile]).trim().split('\n');
	if (!['mode: count', 'mode: atomic'].includes(lines.shift()))
		throw new Error('Expected Go count or atomic coverage');
	const files = new Map();
	for (const line of lines) {
		const match = /^(.*):(\d+)\.(\d+),(\d+)\.(\d+) (\d+) (\d+)$/.exec(line);
		if (!match) throw new Error(`Malformed coverage record: ${line}`);
		const [, filename, startLine, startColumn, endLine, endColumn, statements, count] = match;
		if (!filename.includes('/internal/exactcompiler/') && !filename.includes('/cmd/exactc/'))
			throw new Error(`Unexpected coverage owner: ${filename}`);
		const file = files.get(filename) ?? { filename, statements: 0, covered: 0, uncovered: [] };
		file.statements += Number(statements);
		if (Number(count) > 0) file.covered += Number(statements);
		else if (Number(statements) > 0)
			file.uncovered.push({
				startLine: Number(startLine),
				startColumn: Number(startColumn),
				endLine: Number(endLine),
				endColumn: Number(endColumn),
				statements: Number(statements)
			});
		files.set(filename, file);
	}
	if (!files.size) throw new Error('Empty native coverage');
	const entries = [...files.values()].sort(
		(a, b) =>
			b.statements - b.covered - (a.statements - a.covered) || a.filename.localeCompare(b.filename)
	);
	const statements = entries.reduce((sum, file) => sum + file.statements, 0);
	if (!statements) throw new Error('Native coverage contains no statements');
	const covered = entries.reduce((sum, file) => sum + file.covered, 0);
	return {
		metric: 'Go statement coverage, not logical branch coverage',
		statements,
		covered,
		percent: (100 * covered) / statements,
		files: entries
	};
}

/** Merges execution counters for identical source blocks without counting statements twice. */
export function mergeNativeCoverageProfiles(profiles) {
	if (!profiles.length) throw new Error('Missing native coverage profiles');
	const blocks = new Map();
	for (const profile of profiles) {
		const lines = profile.trim().split('\n');
		if (!['mode: count', 'mode: atomic'].includes(lines.shift()))
			throw new Error('Expected Go count or atomic coverage');
		for (const line of lines) {
			const match = /^(.*:\d+\.\d+,\d+\.\d+) (\d+) (\d+)$/.exec(line);
			if (!match) throw new Error('Malformed native coverage block');
			const [, location, statements, count] = match;
			const previous = blocks.get(location);
			if (previous && previous.statements !== statements)
				throw new Error('Coverage sources disagree');
			const total = (previous?.count ?? 0) + Number(count);
			if (!Number.isSafeInteger(total)) throw new Error('Native coverage counter overflow');
			blocks.set(location, { statements, count: total });
		}
	}
	if (!blocks.size) throw new Error('Empty native coverage');
	return (
		'mode: atomic\n' +
		[...blocks]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([location, block]) => `${location} ${block.statements} ${block.count}`)
			.join('\n') +
		'\n'
	);
}

/** Finds modified source lines in a unified patch without treating surrounding context as owned code. */
export function modifiedPatchLines(patch) {
	const lines = [];
	let next;
	for (const line of patch.split('\n')) {
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			next = Number(hunk[1]);
			continue;
		}
		if (next === undefined || line.startsWith('+++') || line.startsWith('---')) continue;
		if (line.startsWith('+')) {
			if (line.slice(1).trim() && !line.slice(1).trim().startsWith('//')) lines.push(next);
			next++;
		} else if (line.startsWith(' ')) next++;
	}
	if (!lines.length) throw new Error('Patch has no executable additions');
	return lines;
}

/** Counts Gobco true/false outcomes and rejects absent or malformed execution counters. */
export function summarizeGobcoCoverage(records, metric) {
	if (!['branch', 'condition'].includes(metric) || !Array.isArray(records) || !records.length)
		throw new Error('Missing Gobco execution data');
	const uncovered = [];
	let covered = 0;
	for (const record of records) {
		if (
			typeof record.Start !== 'string' ||
			!record.Start ||
			typeof record.Code !== 'string' ||
			!Number.isSafeInteger(record.TrueCount) ||
			record.TrueCount < 0 ||
			!Number.isSafeInteger(record.FalseCount) ||
			record.FalseCount < 0
		)
			throw new Error('Malformed Gobco counter');
		covered += Number(record.TrueCount > 0) + Number(record.FalseCount > 0);
		if (record.TrueCount === 0 || record.FalseCount === 0) uncovered.push(record);
	}
	return {
		metric,
		outcomes: records.length * 2,
		covered,
		percent: (100 * covered) / (records.length * 2),
		uncovered
	};
}
