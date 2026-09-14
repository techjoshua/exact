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

test('audit exceptions enforce valid expiration, severity, uniqueness and current findings', () => {
	const report = { auditReportVersion: 2, vulnerabilities: { example: { severity: 'moderate' } } };
	const exception = { package: 'example', maximumSeverity: 'moderate', expires: '2026-10-01' };
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
