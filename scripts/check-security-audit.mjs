import { validateSecurityAuditReport } from './security-audit-report.mjs';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile('security-audit-policy.json', 'utf8'));
const audit = spawnSync(
	process.platform === 'win32' ? process.env.ComSpec : 'npm',
	process.platform === 'win32' ? ['/d', '/s', '/c', 'npm audit --json'] : ['audit', '--json'],
	{
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024
	}
);
if (audit.error || audit.signal || ![0, 1].includes(audit.status))
	throw new Error('npm audit did not complete successfully.');
if (!audit.stdout) throw new Error(`npm audit produced no report: ${audit.stderr}`);
const report = JSON.parse(audit.stdout);
const count = validateSecurityAuditReport(report, policy);
console.log(`security audit policy ok (${count} reviewed exceptions)`);
