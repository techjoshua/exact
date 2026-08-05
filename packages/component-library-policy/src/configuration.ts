import type { ExactComponentLibraryRule, ExactComponentLibraryTrustConfig } from '@exactjs/config';
import semver from 'semver';
import { canonicalHash } from './hashing.js';
import type { ExactResolvedPackageInstance } from './contracts.js';

/** One validated selector in normalized component-library configuration. */
export type ExactNormalizedComponentLibraryRule = Readonly<{
	package: string;
	scope: boolean;
	version?: string;
	integrity?: string;
	description: string;
}>;

/** Fully defaulted public policy consumed identically by every adapter. */
export type ExactNormalizedComponentLibraryPolicy = Readonly<{
	mode: 'root' | 'trusted' | 'all';
	allow: readonly ExactNormalizedComponentLibraryRule[];
	deny: readonly ExactNormalizedComponentLibraryRule[];
	trustedScopes: readonly string[];
	includeDefaultTrustedScopes: boolean;
	unauthorizedOptionalEnhancements: 'error' | 'exclude';
	policyHash: string;
}>;

/** Validates and deterministically normalizes component-library configuration. */
export function normalizeExactComponentLibraryPolicy(
	config: ExactComponentLibraryTrustConfig | undefined
): ExactNormalizedComponentLibraryPolicy {
	const mode = config?.mode ?? 'trusted';
	if (!['root', 'trusted', 'all'].includes(mode))
		throw new Error(`Invalid componentLibraries.mode: ${String(mode)}`);
	const allow = normalizeRules(config?.allow ?? [], 'allow');
	const deny = normalizeRules(config?.deny ?? [], 'deny');
	const trustedScopes = Object.freeze(
		[...(config?.trustedScopes ?? [])].map((scope) => validateScope(scope, 'trustedScopes')).sort()
	);
	const includeDefaultTrustedScopes = config?.includeDefaultTrustedScopes ?? true;
	const unauthorizedOptionalEnhancements = config?.unauthorizedOptionalEnhancements ?? 'error';
	if (!['error', 'exclude'].includes(unauthorizedOptionalEnhancements))
		throw new Error(
			`Invalid componentLibraries.unauthorizedOptionalEnhancements: ${String(unauthorizedOptionalEnhancements)}`
		);
	const publicPolicy = {
		mode,
		allow: allow.map(ruleHashProjection),
		deny: deny.map(ruleHashProjection),
		trustedScopes,
		includeDefaultTrustedScopes,
		unauthorizedOptionalEnhancements
	};
	return Object.freeze({
		mode,
		allow,
		deny,
		trustedScopes,
		includeDefaultTrustedScopes,
		unauthorizedOptionalEnhancements,
		policyHash: canonicalHash(publicPolicy)
	});
}

/** Returns whether a normalized rule selects one resolved package instance. */
export function exactComponentLibraryRuleMatches(
	rule: ExactNormalizedComponentLibraryRule,
	instance: ExactResolvedPackageInstance
): boolean {
	if (rule.scope ? !instance.name.startsWith(rule.package) : instance.name !== rule.package)
		return false;
	if (rule.version && !semver.satisfies(instance.version, rule.version)) return false;
	return !rule.integrity || instance.integrity === rule.integrity;
}

function normalizeRules(
	rules: readonly ExactComponentLibraryRule[],
	field: 'allow' | 'deny'
): readonly ExactNormalizedComponentLibraryRule[] {
	return Object.freeze(
		rules
			.map((rule, index) => normalizeRule(rule, `${field}[${index}]`))
			.sort((left, right) => left.description.localeCompare(right.description))
	);
}

function normalizeRule(
	rule: ExactComponentLibraryRule,
	field: string
): ExactNormalizedComponentLibraryRule {
	if (typeof rule === 'string') {
		const scope = rule.endsWith('/');
		const packageName = scope ? validateScope(rule, field) : validatePackageName(rule, field);
		return Object.freeze({ package: packageName, scope, description: packageName });
	}
	if (!rule || typeof rule !== 'object' || Array.isArray(rule))
		throw new Error(`componentLibraries.${field} must be a package rule`);
	const packageName = validatePackageName(rule.package, field);
	if (rule.version && !semver.validRange(rule.version))
		throw new Error(`componentLibraries.${field}.version is not a valid semver range`);
	if (rule.integrity !== undefined && !rule.integrity.trim())
		throw new Error(`componentLibraries.${field}.integrity cannot be empty`);
	const description = [packageName, rule.version, rule.integrity].filter(Boolean).join(' ');
	return Object.freeze({
		package: packageName,
		scope: false,
		...(rule.version ? { version: rule.version } : {}),
		...(rule.integrity ? { integrity: rule.integrity } : {}),
		description
	});
}

function validatePackageName(value: string, field: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.endsWith('/') ||
		!/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i.test(value)
	)
		throw new Error(`componentLibraries.${field} is not an exact package name`);
	return value;
}

function validateScope(value: string, field: string): string {
	if (typeof value !== 'string' || !/^@[a-z0-9][a-z0-9._-]*\/$/i.test(value))
		throw new Error(`componentLibraries.${field} must be a scope ending in /`);
	return value;
}

function ruleHashProjection(rule: ExactNormalizedComponentLibraryRule): object {
	return {
		package: rule.package,
		...(rule.version ? { version: rule.version } : {}),
		...(rule.integrity ? { integrity: rule.integrity } : {})
	};
}
