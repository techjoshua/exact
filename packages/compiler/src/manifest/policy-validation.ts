import type { ExactPolicyManifestIR } from '../types.js';

/** Reports whether exact policy manifest. */
export function isExactPolicyManifest(value: unknown): value is ExactPolicyManifestIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const policy = value as Partial<ExactPolicyManifestIR>;
	return (
		policy.version === 1 &&
		Array.isArray(policy.subjects) &&
		policy.subjects.every((subject) => {
			if (!subject || typeof subject !== 'object' || Array.isArray(subject)) return false;
			const record = subject as Record<string, unknown>;
			return (
				typeof record.id === 'string' &&
				record.id.length > 0 &&
				['declaration', 'field', 'parameter', 'return', 'state', 'context'].includes(
					String(record.kind)
				) &&
				typeof record.name === 'string' &&
				record.name.length > 0 &&
				(record.path === undefined || typeof record.path === 'string') &&
				(record.componentId === undefined || typeof record.componentId === 'string') &&
				(record.callableId === undefined || typeof record.callableId === 'string') &&
				(record.parameterIndex === undefined ||
					(Number.isInteger(record.parameterIndex) && (record.parameterIndex as number) >= 0)) &&
				(record.selector === undefined ||
					(typeof record.selector === 'string' && record.selector.length > 0)) &&
				isExactDataPolicy(record.policy) &&
				['annotation', 'context-option', 'inference', 'import'].includes(String(record.source))
			);
		}) &&
		Array.isArray(policy.flows) &&
		policy.flows.every((flow) => {
			if (!flow || typeof flow !== 'object' || Array.isArray(flow)) return false;
			const record = flow as Record<string, unknown>;
			return (
				typeof record.id === 'string' &&
				record.id.length > 0 &&
				['propagation', 'receipt', 'projection', 'transfer'].includes(String(record.kind)) &&
				Array.isArray(record.from) &&
				record.from.every((source) => typeof source === 'string') &&
				typeof record.to === 'string' &&
				record.to.length > 0 &&
				isExactDataPolicy(record.policy) &&
				(record.boundary === undefined ||
					[
						'client-island',
						'hydration',
						'context',
						'call',
						'state',
						'vnode',
						'error',
						'log'
					].includes(String(record.boundary))) &&
				typeof record.authorized === 'boolean' &&
				(record.reason === undefined || typeof record.reason === 'string')
			);
		}) &&
		Array.isArray(policy.secretConsumers) &&
		policy.secretConsumers.every(isExactSecretConsumption)
	);
}

function isExactSecretConsumption(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	const consumer = record.consumer as Record<string, unknown> | undefined;
	return (
		typeof record.id === 'string' &&
		record.id.length > 0 &&
		(record.selector === undefined ||
			(typeof record.selector === 'string' && record.selector.length > 0)) &&
		typeof record.dynamic === 'boolean' &&
		typeof record.source === 'string' &&
		Number.isInteger(record.line) &&
		(record.line as number) >= 0 &&
		Number.isInteger(record.column) &&
		(record.column as number) >= 0 &&
		typeof record.caller === 'string' &&
		!!consumer &&
		typeof consumer.package === 'string' &&
		typeof consumer.symbol === 'string' &&
		Number.isInteger(consumer.parameter) &&
		(consumer.parameter as number) >= 0 &&
		['client', 'server'].includes(String(record.target)) &&
		['implicit-application-owner', 'library-requirement', 'denied'].includes(
			String(record.authorization)
		) &&
		(record.reason === undefined || typeof record.reason === 'string')
	);
}

function isExactDataPolicy(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const policy = value as Record<string, unknown>;
	return (
		['server', 'client', 'isomorphic'].includes(String(policy.residency)) &&
		typeof policy.secret === 'boolean' &&
		(!policy.secret || policy.residency === 'server')
	);
}

/** Reports whether exact capability requirements. */
export function isExactCapabilityRequirements(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (!Array.isArray(record.rawHtml)) return false;
	return record.rawHtml.every((raw) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
		const requirement = raw as Record<string, unknown>;
		return (
			typeof requirement.source === 'string' &&
			Number.isInteger(requirement.line) &&
			(requirement.line as number) > 0 &&
			Number.isInteger(requirement.column) &&
			(requirement.column as number) > 0 &&
			typeof requirement.symbol === 'string' &&
			requirement.symbol.length > 0 &&
			Array.isArray(requirement.targets) &&
			requirement.targets.length > 0 &&
			requirement.targets.every((target) => target === 'client' || target === 'server') &&
			new Set(requirement.targets).size === requirement.targets.length
		);
	});
}

/** Reports whether exact asset dependency. */
export function isExactAssetDependency(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const asset = value as Record<string, unknown>;
	return (
		typeof asset.specifier === 'string' &&
		asset.specifier.length > 0 &&
		['style', 'image', 'video', 'audio', 'font', 'document', 'data', 'worker', 'other'].includes(
			String(asset.kind)
		) &&
		['side-effect', 'url', 'raw', 'inline', 'module', 'worker'].includes(
			String(asset.importMode)
		) &&
		['client', 'server', 'both'].includes(String(asset.evaluationTarget)) &&
		['client', 'server', 'both', 'embedded'].includes(String(asset.deliveryTarget))
	);
}
