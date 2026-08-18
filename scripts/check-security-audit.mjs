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
if (!audit.stdout) throw new Error(`npm audit produced no report: ${audit.stderr}`);
const report = JSON.parse(audit.stdout);
const severity = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const exceptions = new Map(policy.exceptions.map((entry) => [entry.package, entry]));
const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
	const exception = exceptions.get(name);
	if (!exception) failures.push(`${name}: new ${vulnerability.severity} advisory`);
	else if (severity[vulnerability.severity] > severity[exception.maximumSeverity])
		failures.push(`${name}: ${vulnerability.severity} exceeds ${exception.maximumSeverity}`);
	else if (Date.parse(exception.expires) < Date.now()) failures.push(`${name}: exception expired`);
	exceptions.delete(name);
}
for (const name of exceptions.keys())
	failures.push(`${name}: stale exception (advisory no longer present)`);
if (failures.length) throw new Error(`Security audit policy failed:\n${failures.join('\n')}`);
console.log(
	`security audit policy ok (${Object.keys(report.vulnerabilities ?? {}).length} reviewed exceptions)`
);
