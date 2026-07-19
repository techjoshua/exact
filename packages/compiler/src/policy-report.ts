import type { ExactCompilerManifest, ExactPolicyAuditReport } from './types.js';

export type ExactPolicyAuditReportOptions = {
	allowPackages?: readonly string[];
	generatedAt?: Date;
};

/** Aggregates package requirements and application flows without ever reading secret values. */
export function createExactPolicyAuditReport(
	manifests: readonly ExactCompilerManifest[],
	options: ExactPolicyAuditReportOptions = {}
): ExactPolicyAuditReport {
	const allowPackages = options.allowPackages ?? [];
	const usedPackages = new Set<string>();
	const secretUsage = manifests
		.flatMap((manifest) =>
			manifest.policy.secretConsumers.map((use) => {
				if (allowPackages.includes(use.consumer.package)) usedPackages.add(use.consumer.package);
				const status =
					use.authorization === 'implicit-application-owner'
						? ('implicit' as const)
						: use.authorization === 'denied'
							? ('denied' as const)
							: allowPackages.includes(use.consumer.package)
								? ('granted' as const)
								: ('required' as const);
				return {
					selector: use.selector ?? '<dynamic>',
					consumer: use.consumer.package,
					symbol: use.consumer.symbol,
					parameter: use.consumer.parameter,
					status,
					source: `${use.source}:${use.line}:${use.column}`
				};
			})
		)
		.sort(
			(left, right) =>
				left.selector.localeCompare(right.selector) ||
				left.consumer.localeCompare(right.consumer) ||
				left.source.localeCompare(right.source)
		);
	const warnings = allowPackages
		.filter((packageName) => !usedPackages.has(packageName))
		.map((packageName) => `Unused secret package permission: ${packageName}`)
		.sort();
	const errors = secretUsage
		.filter((use) => use.status === 'denied' || use.status === 'required')
		.map(
			(use) => `${use.consumer}#${use.symbol} consumes ${use.selector} without package permission`
		)
		.sort();
	return {
		version: 1,
		generatedAt: (options.generatedAt ?? new Date()).toISOString(),
		secretUsage,
		warnings,
		errors
	};
}

/** Produces deterministic review output suitable for CI artifacts. */
export function formatExactPolicyAuditReport(report: ExactPolicyAuditReport): string {
	const rows = [
		'Secret\tConsumer\tStatus\tSource',
		...report.secretUsage.map(
			(use) =>
				`${use.selector}\t${use.consumer}#${use.symbol}[${use.parameter}]\t${use.status}\t${use.source}`
		)
	];
	if (report.warnings.length) rows.push('', 'Warnings', ...report.warnings);
	if (report.errors.length) rows.push('', 'Errors', ...report.errors);
	return `${rows.join('\n')}\n`;
}
