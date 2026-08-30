const percentiles = Object.freeze(['p50', 'p75', 'p95', 'p99']);

/** Renders the complete auditable tables for one validated checkpoint. */
export function renderComponentLocalTargetAbiCheckpointReport(checkpoint, comparisons = []) {
	if (!checkpoint || checkpoint.eligibleForSeries !== true)
		throw new Error('only an accepted component-local target ABI checkpoint can be published');
	if (!Array.isArray(checkpoint.suites) || checkpoint.suites.length === 0)
		throw new Error('accepted checkpoint omitted measurement suites');
	const sections = [
		`# Component-local target ABI ${checkpoint.checkpoint} checkpoint`,
		'',
		'| Phase | Revision | Status | Correctness gate | Structural gate | Environment |',
		'| --- | --- | --- | --- | --- | --- |',
		`| ${checkpoint.checkpoint} | ${escapeCell(checkpoint.identity.revision)} | accepted | passed | passed | ${escapeCell(checkpoint.environment.lineage)} |`,
		'',
		'## Current results',
		''
	];
	for (const suite of checkpoint.suites) sections.push(...renderCurrentSuite(suite));
	if (comparisons.length > 0) {
		sections.push('## Phase deltas', '');
		for (const comparison of comparisons) sections.push(...renderComparison(comparison));
	}
	sections.push('## Structural evidence', '', renderStructural(checkpoint.structuralReport), '');
	if (checkpoint.limitations.length > 0) {
		sections.push(
			'## Limitations',
			'',
			...checkpoint.limitations.map((limitation) => `- ${limitation}`),
			''
		);
	}
	if (checkpoint.analysis) sections.push(...renderAnalysis(checkpoint.analysis));
	return `${sections.join('\n').trimEnd()}\n`;
}

function renderAnalysis(analysis) {
	const groups = [
		['Material improvements', analysis.improvements],
		['Material regressions', analysis.regressions],
		['Unexpected or missing movement', analysis.unexpected],
		['Disposition', analysis.disposition]
	];
	const lines = ['## Material-change analysis', ''];
	for (const [title, entries] of groups) {
		if (entries.length === 0) continue;
		lines.push(`### ${title}`, '', ...entries.map((entry) => `- ${entry}`), '');
	}
	return lines;
}

function renderCurrentSuite(suite) {
	if (suite.table.suite.startsWith('framework-comparison-'))
		return renderFrameworkComparisonSuite(suite);
	const participants = suite.table.participants;
	const lines = [
		`### ${suite.table.suite}`,
		'',
		`Populations: ${suite.populations.map((population) => (population.kind === 'reported' ? `${population.name} (reported aggregate; ${population.metrics.join(', ')})` : `${population.name} (${population.sampleCount} samples; ${population.warmupCount} warmups; ${population.metrics.join(', ')})`)).join('; ')}.`,
		...(suite.sourcePublication
			? [
					`Source publication: ${suite.sourcePublication.status} — ${suite.sourcePublication.reason}. This status does not determine ABI checkpoint eligibility.`
				]
			: []),
		...(suite.sourceLimitations?.length
			? [`Source limitations: ${suite.sourceLimitations.map(escapeCell).join('; ')}.`]
			: []),
		...(suite.responseIdentity?.status === 'inapplicable'
			? [`Response identity: N/A — ${suite.responseIdentity.reason}.`]
			: []),
		'',
		`| Metric | Unit | Percentile | ${participants.map((entry) => escapeCell(entry.name)).join(' | ')} |`,
		`| --- | --- | --- | ${participants.map(() => '---:').join(' | ')} |`
	];
	for (const metric of suite.table.metrics) {
		for (const percentile of percentiles) {
			lines.push(
				`| ${escapeCell(metric)} | ${escapeCell(participants[0].metrics[metric].unit)} | ${percentile} | ${participants.map((entry) => formatNumber(entry.metrics[metric][percentile])).join(' | ')} |`
			);
		}
	}
	return [...lines, ''];
}

/** Renders the monitoring view with frameworks as rows and percentile tuples as cells. */
function renderFrameworkComparisonSuite(suite) {
	const participants = suite.table.participants;
	const metrics = suite.table.metrics;
	const lines = [
		`### ${suite.table.suite}`,
		'',
		'Every metric cell is `p50 / p75 / p95 / p99`.',
		'',
		`Populations: ${suite.populations.map((population) => (population.kind === 'reported' ? `${population.name} (reported aggregate; ${population.metrics.join(', ')})` : `${population.name} (${population.sampleCount} samples; ${population.warmupCount} warmups; ${population.metrics.join(', ')})`)).join('; ')}.`,
		...(suite.sourcePublication
			? [
					`Source publication: ${suite.sourcePublication.status} — ${suite.sourcePublication.reason}. This status does not determine ABI checkpoint eligibility.`
				]
			: []),
		...(suite.sourceLimitations?.length
			? [`Source limitations: ${suite.sourceLimitations.map(escapeCell).join('; ')}.`]
			: []),
		...(suite.responseIdentity?.status === 'inapplicable'
			? [`Response identity: N/A — ${suite.responseIdentity.reason}.`]
			: []),
		'',
		`| Framework | ${metrics.map((metric) => `${escapeCell(metric)} (${escapeCell(participants[0].metrics[metric].unit)})`).join(' | ')} |`,
		`| --- | ${metrics.map(() => '---:').join(' | ')} |`
	];
	for (const participant of participants) {
		lines.push(
			`| ${frameworkLabel(participant.name)} | ${metrics.map((metric) => percentiles.map((percentile) => formatNumber(participant.metrics[metric][percentile])).join(' / ')).join(' | ')} |`
		);
	}
	return [...lines, ''];
}

function frameworkLabel(name) {
	const normalized = name.replace(/-controlled$/, '');
	if (normalized === 'exact') return 'eXact';
	if (normalized === 'react') return 'React';
	if (normalized === 'sveltekit') return 'SvelteKit';
	if (normalized === 'nuxt') return 'Nuxt';
	return escapeCell(name);
}

function renderComparison(comparison) {
	if (!comparison || typeof comparison.suite !== 'string' || !Array.isArray(comparison.rows))
		throw new Error('checkpoint comparison is malformed');
	const baseline = comparison.baseline ?? 'before';
	const lines = [
		`### ${comparison.suite} vs ${baseline}`,
		'',
		'| Metric | Unit | Percentile | Before raw | Control factor | Before normalized | Current | Delta | Delta % | Confidence |',
		'| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
	];
	for (const row of comparison.rows) {
		lines.push(
			`| ${escapeCell(row.metric)} | ${escapeCell(row.unit)} | ${row.percentile} | ${formatNumber(row.beforeRaw)} | ${row.controlFactor === undefined ? 'not applied' : formatNumber(row.controlFactor)} | ${formatNumber(row.normalizedBefore)} | ${formatNumber(row.current)} | ${formatNumber(row.delta)} | ${row.deltaRatio === undefined ? 'N/A' : formatPercent(row.deltaRatio)} | ${escapeCell(row.confidence)} |`
		);
	}
	return [...lines, ''];
}

function renderStructural(report) {
	const boundaries = [['native', report.native], ...Object.entries(report.explicitBoundaries)];
	const fields = Object.keys(report.native.totals);
	const lines = [
		`| Boundary | Artifacts | Client | Server | ${fields.map(escapeCell).join(' | ')} |`,
		`| --- | ---: | ---: | ---: | ${fields.map(() => '---:').join(' | ')} |`
	];
	for (const [name, aggregate] of boundaries) {
		lines.push(
			`| ${name} | ${aggregate.artifacts} | ${aggregate.byTarget.client} | ${aggregate.byTarget.server} | ${fields.map((field) => aggregate.totals[field]).join(' | ')} |`
		);
	}
	return lines.join('\n');
}

function formatNumber(value) {
	if (!Number.isFinite(value)) throw new Error('checkpoint report encountered a non-finite value');
	return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(8)));
}

function formatPercent(value) {
	return `${Number((value * 100).toPrecision(6))}%`;
}

function escapeCell(value) {
	return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
