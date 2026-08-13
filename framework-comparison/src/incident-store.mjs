/** Error carrying the current authoritative incident after an optimistic concurrency conflict. */
export class IncidentConflictError extends Error {
	constructor(current) {
		super(`incident ${current.id} changed from the expected version`);
		this.name = 'IncidentConflictError';
		this.current = structuredClone(current);
	}
}

/** Owns deterministic comparison-domain state and publishes accepted resource changes. */
export class IncidentStore {
	#baseline;
	#fixture;
	#listeners = new Set();
	#commentMutations = new Map();
	#now;
	#nextComment = 1;
	#nextJob = 1;

	constructor(fixture, options = {}) {
		this.#baseline = structuredClone(fixture);
		this.#now = options.now ?? (() => new Date().toISOString());
		this.reset();
	}

	/** Restores a fresh fixture snapshot and invalidates resources created by a prior scenario. */
	reset(options = {}) {
		this.#fixture = structuredClone(this.#baseline);
		if (options.empty === true) this.#fixture.incidents = [];
		this.#nextComment = 1;
		this.#nextJob = 1;
		this.#commentMutations.clear();
		this.#publish('reset', this.snapshot());
	}

	/** Returns a detached snapshot suitable for transport to an untrusted participant. */
	snapshot() {
		return structuredClone(this.#fixture);
	}

	/** Returns severity-ordered detached incidents. */
	listIncidents() {
		const rank = { critical: 0, high: 1, medium: 2, low: 3 };
		return structuredClone(
			[...this.#fixture.incidents].sort(
				(left, right) =>
					rank[left.severity] - rank[right.severity] || left.id.localeCompare(right.id)
			)
		);
	}

	/** Returns one detached incident or `undefined` when the identifier is unknown. */
	getIncident(id) {
		const incident = this.#fixture.incidents.find((candidate) => candidate.id === id);
		return incident ? structuredClone(incident) : undefined;
	}

	/** Claims an open incident when the actor and expected version are authoritative. */
	claimIncident(id, actorId, expectedVersion) {
		this.#requireUser(actorId);
		const incident = this.#requireIncident(id);
		if (incident.version !== expectedVersion) throw new IncidentConflictError(incident);
		if (incident.status === 'closed')
			throw new DomainInputError('closed incidents cannot be claimed');
		incident.ownerId = actorId;
		incident.status = 'investigating';
		this.#advanceIncident(incident);
		return structuredClone(incident);
	}

	/** Adds one validated comment and advances the owning incident version exactly once. */
	addComment(id, actorId, body, clientMutationId) {
		this.#requireUser(actorId);
		if (typeof clientMutationId !== 'string' || clientMutationId.length === 0)
			throw new DomainInputError('clientMutationId must be a non-empty string');
		const mutationKey = `${id}:${actorId}:${clientMutationId}`;
		const prior = this.#commentMutations.get(mutationKey);
		if (prior) return structuredClone(prior);
		if (typeof body !== 'string') throw new DomainInputError('comment body must be a string');
		const normalized = body.trim();
		const length = [...normalized].length;
		if (length === 0 || length > 2_000)
			throw new DomainInputError('comment body must contain 1 to 2,000 code points');
		const incident = this.#requireIncident(id);
		const comment = {
			id: `comment-${this.#nextComment++}`,
			authorId: actorId,
			body: normalized,
			createdAt: this.#now()
		};
		incident.comments.push(comment);
		this.#advanceIncident(incident);
		const result = { comment: structuredClone(comment), incident: structuredClone(incident) };
		this.#commentMutations.set(mutationKey, result);
		return structuredClone(result);
	}

	/** Creates a queued analysis job associated with an existing incident. */
	startAnalysis(id) {
		this.#requireIncident(id);
		const job = {
			id: `job-${this.#nextJob++}`,
			incidentId: id,
			status: 'queued',
			result: null
		};
		this.#fixture.jobs.push(job);
		this.#publish('job', job);
		return structuredClone(job);
	}

	/** Advances a known analysis job and publishes its authoritative progress. */
	advanceJob(id, status, result = null) {
		if (!['running', 'completed', 'failed'].includes(status))
			throw new DomainInputError(`invalid job status ${status}`);
		const job = this.#fixture.jobs.find((candidate) => candidate.id === id);
		if (!job) throw new DomainNotFoundError(`unknown job ${id}`);
		job.status = status;
		job.result = result;
		this.#publish('job', job);
		return structuredClone(job);
	}

	/** Returns one detached analysis job or `undefined` when it is unknown. */
	getJob(id) {
		const job = this.#fixture.jobs.find((candidate) => candidate.id === id);
		return job ? structuredClone(job) : undefined;
	}

	/** Subscribes to accepted domain changes and returns an idempotent release function. */
	subscribe(listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#advanceIncident(incident) {
		incident.version += 1;
		incident.updatedAt = this.#now();
		this.#publish('incident', incident);
	}

	#publish(type, value) {
		const event = { type, value: structuredClone(value) };
		for (const listener of this.#listeners) listener(event);
	}

	#requireIncident(id) {
		const incident = this.#fixture.incidents.find((candidate) => candidate.id === id);
		if (!incident) throw new DomainNotFoundError(`unknown incident ${id}`);
		return incident;
	}

	#requireUser(id) {
		if (!this.#fixture.users.some((candidate) => candidate.id === id))
			throw new DomainInputError(`unknown user ${id}`);
	}
}

/** Error representing invalid application input at the controlled service boundary. */
export class DomainInputError extends Error {}

/** Error representing an unknown fixture resource. */
export class DomainNotFoundError extends Error {}
