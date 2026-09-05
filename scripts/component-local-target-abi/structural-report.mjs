const targetNames = Object.freeze(['client', 'server']);
const boundaryNames = Object.freeze(['native', 'react', 'plugin', 'test']);

/** Structural inventory fields that describe emitted native coverage rather than fallback. */
export const componentLocalTargetAbiInventoryFields = Object.freeze([
	'nativeComponents',
	'targetArtifacts'
]);

/** Structural counters that must reach zero before the proposal can be accepted. */
export const componentLocalTargetAbiFallbackFields = Object.freeze([
	'declinedNativeJsxRegions',
	'fallbackBearingArtifacts',
	'genericNativeBindingGroups',
	'genericNativeRendererImports',
	'genericNativeSsrImports',
	'runtimeCreatedNativeArtifacts',
	'parentOwnedChildDirtyRouting'
]);

const allFields = Object.freeze([
	...componentLocalTargetAbiInventoryFields,
	...componentLocalTargetAbiFallbackFields
]);
const diagnosticFieldPrefix = 'declinedReason:';
const genericDiagnosticFieldPrefix = 'genericReason:';
const genericRendererDiagnosticFieldPrefix = 'genericRendererReason:';

/**
 * Aggregates compiler- and build-emitted artifact evidence without allowing explicit foreign or
 * test boundaries to hide native fallback. Every input record represents one physical target
 * artifact and must report every structural field, including zeroes.
 */
export function createComponentLocalTargetAbiStructuralReport(records) {
	if (!Array.isArray(records) || records.length === 0)
		throw new Error('component-local target ABI structural reporting requires artifact records');
	const identities = new Set();
	const native = emptyAggregate();
	const explicitBoundaries = Object.fromEntries(
		boundaryNames
			.filter((boundary) => boundary !== 'native')
			.map((boundary) => [boundary, emptyAggregate()])
	);
	for (const [index, candidate] of records.entries()) {
		const record = validatedRecord(candidate, index);
		const identity = `${record.id}\0${record.target}`;
		if (identities.has(identity))
			throw new Error(
				`duplicate component-local target ABI artifact ${JSON.stringify(record.id)} for ${record.target}`
			);
		identities.add(identity);
		addRecord(record.boundary === 'native' ? native : explicitBoundaries[record.boundary], record);
	}
	return Object.freeze({
		schemaVersion: 1,
		artifactRecords: records.length,
		native: freezeAggregate(native),
		explicitBoundaries: Object.freeze(
			Object.fromEntries(
				Object.entries(explicitBoundaries).map(([name, aggregate]) => [
					name,
					freezeAggregate(aggregate)
				])
			)
		)
	});
}

/**
 * Verifies that a report is complete and that the selected native fallback fields are zero.
 * Explicit React, plugin, and test machinery remains visible but is never added to native totals.
 */
export function assertComponentLocalTargetAbiStructuralGate(
	report,
	zeroFields = componentLocalTargetAbiFallbackFields
) {
	validatedReport(report);
	if (!Array.isArray(zeroFields)) throw new Error('structural zero fields must be an array');
	const unknown = zeroFields.filter(
		(field) => !componentLocalTargetAbiFallbackFields.includes(field)
	);
	if (unknown.length)
		throw new Error(`unknown component-local target ABI structural fields: ${unknown.join(', ')}`);
	const failures = zeroFields.filter((field) => report.native.totals[field] !== 0);
	if (failures.length) {
		throw new Error(
			`component-local target ABI structural gate failed: ${failures
				.map((field) => `${field}=${report.native.totals[field]}`)
				.join(', ')}`
		);
	}
	return report;
}

function validatedRecord(candidate, index) {
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
		throw new Error(`artifact record ${index + 1} must be an object`);
	if (typeof candidate.id !== 'string' || candidate.id.length === 0)
		throw new Error(`artifact record ${index + 1} requires a non-empty id`);
	if (!targetNames.includes(candidate.target))
		throw new Error(`artifact ${JSON.stringify(candidate.id)} has invalid target`);
	if (!boundaryNames.includes(candidate.boundary))
		throw new Error(`artifact ${JSON.stringify(candidate.id)} has invalid boundary`);
	const unknown = Object.keys(candidate.counts ?? {}).filter(
		(field) => !allFields.includes(field) && !validDiagnosticField(field)
	);
	if (unknown.length)
		throw new Error(
			`artifact ${JSON.stringify(candidate.id)} reports unknown structural fields: ${unknown.join(', ')}`
		);
	const counts = {};
	for (const field of allFields) {
		const value = candidate.counts?.[field];
		if (!Number.isSafeInteger(value) || value < 0)
			throw new Error(
				`artifact ${JSON.stringify(candidate.id)} requires a non-negative integer ${field}`
			);
		counts[field] = value;
	}
	const diagnostics = {};
	for (const [field, value] of Object.entries(candidate.counts ?? {})) {
		if (!validDiagnosticField(field)) continue;
		if (!Number.isSafeInteger(value) || value < 0)
			throw new Error(
				`artifact ${JSON.stringify(candidate.id)} requires a non-negative integer ${field}`
			);
		if (field.startsWith(diagnosticFieldPrefix))
			diagnostics[field.slice(diagnosticFieldPrefix.length)] = value;
		else if (field.startsWith(genericDiagnosticFieldPrefix))
			diagnostics[`generic:${field.slice(genericDiagnosticFieldPrefix.length)}`] = value;
		else
			diagnostics[`renderer:${field.slice(genericRendererDiagnosticFieldPrefix.length)}`] = value;
	}
	return {
		id: candidate.id,
		target: candidate.target,
		boundary: candidate.boundary,
		counts,
		diagnostics
	};
}

function emptyAggregate() {
	return {
		artifacts: 0,
		byTarget: Object.fromEntries(targetNames.map((target) => [target, 0])),
		totals: Object.fromEntries(allFields.map((field) => [field, 0])),
		diagnostics: {}
	};
}

function addRecord(aggregate, record) {
	aggregate.artifacts += 1;
	aggregate.byTarget[record.target] += 1;
	for (const field of allFields) aggregate.totals[field] += record.counts[field];
	for (const [reason, count] of Object.entries(record.diagnostics))
		aggregate.diagnostics[reason] = (aggregate.diagnostics[reason] ?? 0) + count;
}

function freezeAggregate(aggregate) {
	return Object.freeze({
		artifacts: aggregate.artifacts,
		byTarget: Object.freeze({ ...aggregate.byTarget }),
		totals: Object.freeze({ ...aggregate.totals }),
		diagnostics: Object.freeze({ ...aggregate.diagnostics })
	});
}

function validDiagnosticField(field) {
	const prefix = field.startsWith(diagnosticFieldPrefix)
		? diagnosticFieldPrefix
		: field.startsWith(genericDiagnosticFieldPrefix)
			? genericDiagnosticFieldPrefix
			: field.startsWith(genericRendererDiagnosticFieldPrefix)
				? genericRendererDiagnosticFieldPrefix
				: undefined;
	return prefix !== undefined && /^[A-Za-z][A-Za-z0-9-]*$/.test(field.slice(prefix.length));
}

function validatedReport(report) {
	if (!report || report.schemaVersion !== 1)
		throw new Error('unsupported component-local target ABI structural report');
	if (!report.native || typeof report.native !== 'object')
		throw new Error('structural report omitted native totals');
	for (const field of allFields) {
		if (!Number.isSafeInteger(report.native.totals?.[field]) || report.native.totals[field] < 0)
			throw new Error(`structural report omitted valid native ${field}`);
	}
	for (const boundary of boundaryNames.filter((name) => name !== 'native')) {
		const aggregate = report.explicitBoundaries?.[boundary];
		if (!aggregate) throw new Error(`structural report omitted explicit ${boundary} boundaries`);
		for (const field of allFields) {
			if (!Number.isSafeInteger(aggregate.totals?.[field]) || aggregate.totals[field] < 0)
				throw new Error(`structural report omitted valid ${boundary} ${field}`);
		}
	}
}
