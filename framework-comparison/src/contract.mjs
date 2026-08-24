import { readFile } from 'node:fs/promises';

/** Loads and validates one JSON contract file. */
export async function loadJsonContract(path, validate) {
	const value = JSON.parse(await readFile(path, 'utf8'));
	validate(value);
	return value;
}

/** Validates the deterministic application fixture consumed by both comparison tracks. */
export function validateFixture(value) {
	requireObject(value, 'fixture');
	if (value.schemaVersion !== 1) throw new Error('fixture.schemaVersion must be 1');
	requireString(value.sessionUserId, 'fixture.sessionUserId');
	requireArray(value.users, 'fixture.users');
	requireArray(value.incidents, 'fixture.incidents');
	requireArray(value.jobs, 'fixture.jobs');

	const userIds = uniqueIds(value.users, 'fixture.users');
	if (!userIds.has(value.sessionUserId)) throw new Error('fixture session user must exist');
	const incidentIds = uniqueIds(value.incidents, 'fixture.incidents');
	for (const incident of value.incidents) {
		requireString(incident.title, `incident ${incident.id}.title`);
		if (!['critical', 'high', 'medium', 'low'].includes(incident.severity))
			throw new Error(`incident ${incident.id} has an invalid severity`);
		if (!['open', 'investigating', 'closed'].includes(incident.status))
			throw new Error(`incident ${incident.id} has an invalid status`);
		if (!Number.isInteger(incident.version) || incident.version < 1)
			throw new Error(`incident ${incident.id} has an invalid version`);
		if (incident.ownerId !== null && !userIds.has(incident.ownerId))
			throw new Error(`incident ${incident.id} has an unknown owner`);
		requireArray(incident.comments, `incident ${incident.id}.comments`);
	}
	return { userIds, incidentIds };
}

/** Validates scenario identifiers, fixture references, tracks, and declared measurement dimensions. */
export function validateScenarios(value, fixtureIds) {
	requireObject(value, 'scenario catalog');
	if (value.schemaVersion !== 1) throw new Error('scenarios.schemaVersion must be 1');
	requireArray(value.scenarios, 'scenarios.scenarios');
	const scenarioIds = uniqueIds(value.scenarios, 'scenarios.scenarios');
	for (const scenario of value.scenarios) {
		if (!fixtureIds.incidentIds.has(scenario.fixtureIncidentId))
			throw new Error(`scenario ${scenario.id} references an unknown incident`);
		if (!['controlled-service', 'native-full-stack', 'both'].includes(scenario.track))
			throw new Error(`scenario ${scenario.id} has an invalid track`);
		requireString(scenario.settlesWhen, `scenario ${scenario.id}.settlesWhen`);
		requireArray(scenario.metrics, `scenario ${scenario.id}.metrics`);
		if (scenario.metrics.length === 0) throw new Error(`scenario ${scenario.id} requires metrics`);
	}
	return { scenarioIds };
}

/** Validates the metadata required to build and identify a framework participant. */
export function validateParticipant(value) {
	requireObject(value, 'participant');
	if (value.schemaVersion !== 1) throw new Error('participant.schemaVersion must be 1');
	for (const field of ['id', 'framework', 'frameworkVersion', 'runtime', 'baseUrl'])
		requireString(value[field], `participant.${field}`);
	if (!['scaffolded', 'complete'].includes(value.status))
		throw new Error('participant.status must be scaffolded or complete');
	requireArray(value.tracks, 'participant.tracks');
	if (value.tracks.length === 0) throw new Error('participant.tracks must not be empty');
	for (const track of value.tracks) {
		if (!['controlled-service', 'native-full-stack'].includes(track))
			throw new Error(`participant has invalid track ${track}`);
	}
	requireObject(value.commands, 'participant.commands');
	requireString(value.commands.build, 'participant.commands.build');
	requireString(value.commands.start, 'participant.commands.start');
	requireArray(value.sourceRoots, 'participant.sourceRoots');
	requireObject(value.ssrTransports, 'participant.ssrTransports');
	if (value.ssrTransports.node !== 'node-http')
		throw new Error('participant.ssrTransports.node must be node-http');
	if (!['node-http-compat', 'bun-fetch'].includes(value.ssrTransports.bun))
		throw new Error('participant.ssrTransports.bun must be node-http-compat or bun-fetch');
}

/** Validates the independent framework-specialist decision that gates publishable measurements. */
export function validateReview(value, participantId) {
	requireObject(value, 'participant review');
	if (value.schemaVersion !== 1) throw new Error('participant review schemaVersion must be 1');
	if (value.participantId !== participantId)
		throw new Error(`participant review must identify ${participantId}`);
	if (!['pending', 'approved', 'changes-requested'].includes(value.status))
		throw new Error(`participant review ${participantId} has an invalid status`);
	requireArray(value.findings, `participant review ${participantId}.findings`);
	if (value.status === 'approved') {
		requireString(value.reviewer, `participant review ${participantId}.reviewer`);
		requireString(value.reviewedAt, `participant review ${participantId}.reviewedAt`);
	}
}

function uniqueIds(values, label) {
	const ids = new Set();
	for (const value of values) {
		requireObject(value, `${label} entry`);
		requireString(value.id, `${label} entry id`);
		if (ids.has(value.id)) throw new Error(`${label} contains duplicate id ${value.id}`);
		ids.add(value.id);
	}
	return ids;
}

function requireArray(value, label) {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function requireObject(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${label} must be an object`);
}

function requireString(value, label) {
	if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a string`);
}
