/** Validates an npm audit report and dated exceptions; malformed reports never mean no findings. */
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
			!entry?.package ||
			exceptions.has(entry.package) ||
			!Object.hasOwn(severity, entry.maximumSeverity) ||
			!Number.isFinite(Date.parse(entry.expires))
		)
			throw new Error('Invalid or duplicate security audit exception.');
		exceptions.set(entry.package, entry);
	}
	const failures = [];
	for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
		const exception = exceptions.get(name);
		if (!Object.hasOwn(severity, vulnerability?.severity))
			failures.push(`${name}: invalid severity`);
		else if (!exception) failures.push(`${name}: new ${vulnerability.severity} advisory`);
		else if (severity[vulnerability.severity] > severity[exception.maximumSeverity])
			failures.push(`${name}: ${vulnerability.severity} exceeds ${exception.maximumSeverity}`);
		else if (Date.parse(exception.expires) <= now) failures.push(`${name}: exception expired`);
		exceptions.delete(name);
	}
	for (const name of exceptions.keys())
		failures.push(`${name}: stale exception (advisory no longer present)`);
	if (failures.length) throw new Error(`Security audit policy failed:\n${failures.join('\n')}`);
	return Object.keys(report.vulnerabilities).length;
}
