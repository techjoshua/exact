/** Requires exact reviewed advisory identities, severity caps and dated exceptions. Malformed reports fail closed. */
export function validateSecurityAuditReport(report, policy, now = Date.now()) {
	if (
		report?.error ||
		report?.auditReportVersion !== 2 ||
		!report.vulnerabilities ||
		typeof report.vulnerabilities !== 'object' ||
		Array.isArray(report.vulnerabilities)
	)
		throw new Error('npm audit returned an error or malformed report.');
	if (!Array.isArray(policy?.exceptions))
		throw new Error('Invalid security audit exception policy.');
	const severity = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
	const exceptions = new Map();
	for (const entry of policy.exceptions) {
		if (
			typeof entry?.package !== 'string' ||
			!entry.package ||
			exceptions.has(entry.package) ||
			!Object.hasOwn(severity, entry.maximumSeverity) ||
			!Number.isFinite(Date.parse(entry.expires)) ||
			!Array.isArray(entry.advisories) ||
			!entry.advisories.length ||
			entry.advisories.some((url) => !isAdvisoryUrl(url)) ||
			new Set(entry.advisories).size !== entry.advisories.length
		)
			throw new Error('Invalid or duplicate security audit exception.');
		exceptions.set(entry.package, entry);
	}
	const failures = [];
	for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
		const exception = exceptions.get(name);
		const advisories = inheritedAdvisories(report.vulnerabilities, name);
		if (!Object.hasOwn(severity, vulnerability?.severity))
			failures.push(`${name}: invalid severity`);
		else if (!exception) failures.push(`${name}: new ${vulnerability.severity} advisory`);
		else if (severity[vulnerability.severity] > severity[exception.maximumSeverity])
			failures.push(`${name}: ${vulnerability.severity} exceeds ${exception.maximumSeverity}`);
		else if (Date.parse(exception.expires) <= now) failures.push(`${name}: exception expired`);
		if (exception) {
			const reviewed = new Set(exception.advisories);
			for (const url of advisories)
				if (!reviewed.has(url)) failures.push(`${name}: unreviewed advisory ${url}`);
			for (const url of reviewed)
				if (!advisories.has(url)) failures.push(`${name}: stale advisory exception ${url}`);
		}
		exceptions.delete(name);
	}
	for (const name of exceptions.keys())
		failures.push(`${name}: stale exception (advisory no longer present)`);
	if (failures.length) throw new Error(`Security audit policy failed:\n${failures.join('\n')}`);
	return Object.keys(report.vulnerabilities).length;
}

/** Collects causes without recursion, visiting each reachable node and edge once per package, including cycles. */
function inheritedAdvisories(vulnerabilities, root) {
	const pending = [root];
	const visited = new Set();
	const advisories = new Set();
	while (pending.length) {
		const name = pending.pop();
		if (visited.has(name)) continue;
		visited.add(name);
		if (!Object.hasOwn(vulnerabilities, name))
			throw new Error(`npm audit returned a malformed advisory graph: missing ${name}`);
		const via = vulnerabilities[name]?.via;
		if (!Array.isArray(via) || !via.length)
			throw new Error(`npm audit returned a malformed advisory graph for ${name}`);
		for (const cause of via) {
			if (typeof cause === 'string' && cause) pending.push(cause);
			else if (cause && !Array.isArray(cause) && isAdvisoryUrl(cause.url))
				advisories.add(cause.url);
			else throw new Error(`npm audit returned a malformed advisory cause for ${name}`);
		}
	}
	if (!advisories.size)
		throw new Error(`npm audit returned an advisory graph without causes for ${root}`);
	return advisories;
}

/** Matches the GitHub advisory identities reviewed by this repository's exception policy. */
function isAdvisoryUrl(value) {
	return (
		typeof value === 'string' &&
		/^https:\/\/github\.com\/advisories\/GHSA-(?:[a-z0-9]{4}-){2}[a-z0-9]{4}$/i.test(value)
	);
}
