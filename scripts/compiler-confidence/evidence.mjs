import path from 'node:path';

/** Validates current Vitest execution, requiring every named witness to pass exactly once. */
export function verifyExecution(report, witnesses, root) {
	if (
		report.success !== true ||
		!Array.isArray(report.testResults) ||
		report.testResults.length === 0
	)
		throw new Error('Missing or unsuccessful Vitest execution');
	const assertions = report.testResults.flatMap((suite) => {
		if (!Array.isArray(suite.assertionResults)) throw new Error('Missing suite assertions');
		return suite.assertionResults.map((assertion) => ({
			file: path.relative(root, suite.name).replaceAll('\\', '/'),
			title: assertion.title,
			status: assertion.status
		}));
	});
	if (!assertions.length || assertions.some(({ status }) => status !== 'passed'))
		throw new Error('Execution contains failed, skipped, pending, or absent assertions');
	return witnesses.map((witness) => {
		for (const title of witness.tests) {
			const matches = assertions.filter((a) => a.file === witness.file && a.title === title);
			if (matches.length !== 1 || matches[0].status !== 'passed')
				throw new Error(`${witness.id}: expected one passing execution of ${title}`);
		}
		return {
			id: witness.id,
			environment: witness.environment,
			tests: [...witness.tests],
			status: 'verified'
		};
	});
}

/** Rejects inventory drift before running expensive compiler checks. */
export function validateInventory({ witnesses, languageFeatures, contractEdges }) {
	const ids = new Set();
	for (const witness of witnesses) {
		if (
			!witness.id ||
			ids.has(witness.id) ||
			!witness.tests.length ||
			!witness.environment ||
			!witness.file.endsWith('.test.ts') ||
			new Set(witness.tests).size !== witness.tests.length
		)
			throw new Error('Invalid or duplicate execution witness');
		ids.add(witness.id);
	}
	for (const entries of [languageFeatures, contractEdges]) {
		const entryIds = new Set();
		for (const entry of entries) {
			if (!entry.id || entryIds.has(entry.id) || !entry.owner || !entry.limit)
				throw new Error('Invalid inventory entry');
			entryIds.add(entry.id);
			if (entry.kind === 'contract' && (!entry.producer || !entry.consumer))
				throw new Error(`${entry.id}: missing contract obligations`);
			if (!['transformed', 'pass-through', 'diagnostic', 'contract'].includes(entry.kind))
				throw new Error(`${entry.id}: invalid classification`);
			if (!entry.witnesses.length && !entry.gap)
				throw new Error(`${entry.id}: missing evidence or gap`);
			for (const id of entry.witnesses)
				if (!ids.has(id)) throw new Error(`${entry.id}: unknown witness ${id}`);
		}
	}
}

/** Resolves evidence claims only from this run, keeping known gaps and scope limits visible. */
export function resolveInventory(entries, executions) {
	const verified = new Set(executions.filter((e) => e.status === 'verified').map((e) => e.id));
	return entries.map((entry) => ({
		...entry,
		status:
			entry.witnesses.length > 0 && entry.witnesses.every((id) => verified.has(id))
				? 'verified-within-scope'
				: 'gap'
	}));
}
