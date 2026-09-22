import type { ExactLanguageExtensionRole, ExactLanguageExtensionsConfig } from '@exactjs/config';
import type { ExactLanguageProviderDescriptor, ExactLanguageProviderStatus } from './contracts.js';

/** Reports provider identity and configured ignored roles without exposing mutable host state. */
export function providerStatusProvenance(
	descriptor: ExactLanguageProviderDescriptor,
	config: ExactLanguageExtensionsConfig | undefined
): Pick<
	ExactLanguageProviderStatus,
	'packageRoot' | 'manifestPath' | 'integrity' | 'entry' | 'ignoredRoles'
> {
	const roles: ExactLanguageExtensionRole[] = [
		'declarative',
		'analyzer',
		'diagnostics',
		'completions',
		'hover',
		'inlayHints',
		'codeActions'
	];
	return Object.freeze({
		packageRoot: descriptor.packageRoot,
		manifestPath: descriptor.manifestPath,
		...(descriptor.integrity ? { integrity: descriptor.integrity } : {}),
		...(descriptor.entry ? { entry: descriptor.entry } : {}),
		ignoredRoles: Object.freeze(roles.filter((role) => roleIgnored(config, descriptor, role)))
	});
}

function roleIgnored(
	config: ExactLanguageExtensionsConfig | undefined,
	descriptor: ExactLanguageProviderDescriptor,
	capability: ExactLanguageExtensionRole
): boolean {
	return (config?.ignore ?? []).some((rule) => {
		if (!rule.roles.includes(capability)) return false;
		if ('provider' in rule) return rule.provider === descriptor.id;
		return (
			(rule.package.endsWith('/')
				? descriptor.id.startsWith(rule.package)
				: descriptor.id === rule.package) &&
			(!rule.version || rule.version === descriptor.version) &&
			(!rule.integrity || rule.integrity === descriptor.integrity)
		);
	});
}
