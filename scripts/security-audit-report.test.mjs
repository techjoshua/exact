import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSecurityAuditReport } from './security-audit-report.mjs';

test('audit transport errors and malformed reports fail closed even without exceptions', () => {
	for (const report of [
		{},
		{ error: { code: 'E503' } },
		{ auditReportVersion: 2, vulnerabilities: [] }
	])
		assert.throws(
			() => validateSecurityAuditReport(report, { exceptions: [] }),
			/malformed report/
		);
	assert.equal(
		validateSecurityAuditReport({ auditReportVersion: 2, vulnerabilities: {} }, { exceptions: [] }),
		0
	);
});

const reviewed = 'https://github.com/advisories/GHSA-hp3w-g68c-fv3c';
const unreviewed = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';

test('audit exceptions enforce valid expiration, severity, uniqueness and current findings', () => {
	const report = {
		auditReportVersion: 2,
		vulnerabilities: { example: { severity: 'moderate', via: [{ url: reviewed }] } }
	};
	const exception = {
		package: 'example',
		maximumSeverity: 'moderate',
		expires: '2026-10-01',
		advisories: [reviewed]
	};
	const now = Date.parse('2026-09-07');
	assert.equal(validateSecurityAuditReport(report, { exceptions: [exception] }, now), 1);
	for (const exceptions of [
		[],
		[exception, exception],
		[{ ...exception, expires: 'invalid' }],
		[{ ...exception, expires: '2026-01-01' }],
		[{ ...exception, maximumSeverity: 'low' }]
	])
		assert.throws(() => validateSecurityAuditReport(report, { exceptions }, now));
	assert.throws(
		() =>
			validateSecurityAuditReport(
				{ auditReportVersion: 2, vulnerabilities: {} },
				{ exceptions: [exception] },
				now
			),
		/stale exception/
	);
});

test('new direct and inherited advisories cannot use a reviewed critical exception', () => {
	const report = {
		auditReportVersion: 2,
		vulnerabilities: {
			parent: { severity: 'critical', via: ['leaf'] },
			leaf: { severity: 'moderate', via: [{ url: reviewed }] }
		}
	};
	const policy = {
		exceptions: Object.keys(report.vulnerabilities).map((packageName) => ({
			package: packageName,
			maximumSeverity: 'critical',
			expires: '2026-11-10',
			advisories: [reviewed]
		}))
	};
	const now = Date.parse('2026-10-10');
	assert.equal(validateSecurityAuditReport(report, policy, now), 2);
	for (const target of ['parent', 'leaf']) {
		const changed = structuredClone(report);
		changed.vulnerabilities[target].via.push({ url: unreviewed });
		assert.throws(() => validateSecurityAuditReport(changed, policy, now), /unreviewed advisory/);
	}
	const changed = structuredClone(report);
	changed.vulnerabilities.leaf.via.push({ url: unreviewed });
	const leafReviewed = structuredClone(policy);
	leafReviewed.exceptions.find((entry) => entry.package === 'leaf').advisories.push(unreviewed);
	assert.throws(
		() => validateSecurityAuditReport(changed, leafReviewed, now),
		/parent: unreviewed advisory/
	);
});

test('cyclic inherited causes remain verifiable and cycles without advisory identities fail', () => {
	const report = {
		auditReportVersion: 2,
		vulnerabilities: {
			parent: { severity: 'moderate', via: ['leaf'] },
			leaf: { severity: 'moderate', via: ['parent', { url: reviewed }] }
		}
	};
	const policy = {
		exceptions: ['parent', 'leaf'].map((packageName) => ({
			package: packageName,
			maximumSeverity: 'moderate',
			expires: '2026-11-10',
			advisories: [reviewed]
		}))
	};
	const now = Date.parse('2026-10-10');
	assert.equal(validateSecurityAuditReport(report, policy, now), 2);
	report.vulnerabilities.leaf.via.pop();
	assert.throws(() => validateSecurityAuditReport(report, policy, now), /without causes/);
});

test('malformed cause graphs and missing, duplicate or stale advisory identities fail closed', () => {
	const report = {
		auditReportVersion: 2,
		vulnerabilities: { example: { severity: 'moderate', via: [{ url: reviewed }] } }
	};
	const exception = {
		package: 'example',
		maximumSeverity: 'moderate',
		expires: '2026-11-10',
		advisories: [reviewed]
	};
	const now = Date.parse('2026-10-10');
	for (const advisories of [
		undefined,
		[],
		[reviewed, reviewed],
		[null],
		['http://github.com/advisories/GHSA-hp3w-g68c-fv3c']
	])
		assert.throws(
			() =>
				validateSecurityAuditReport(report, { exceptions: [{ ...exception, advisories }] }, now),
			/Invalid.*exception/
		);
	assert.throws(
		() =>
			validateSecurityAuditReport(
				report,
				{ exceptions: [{ ...exception, advisories: [reviewed, unreviewed] }] },
				now
			),
		/stale advisory/
	);
	for (const via of [
		undefined,
		[],
		{},
		[null],
		[{}],
		['missing'],
		['constructor'],
		[{ url: 'https://example.test/unknown' }]
	])
		assert.throws(
			() =>
				validateSecurityAuditReport(
					{ ...report, vulnerabilities: { example: { severity: 'moderate', via } } },
					{ exceptions: [exception] },
					now
				),
			/malformed/
		);
});
