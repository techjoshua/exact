/** Performs the dependency range domain operation. */
export function dependencyRange(value: unknown, packageName: string): string | undefined {
	if (!isRecord(value)) return undefined;
	const range = value[packageName];
	return typeof range === 'string' && range.length ? range : undefined;
}

/** Validates package selector and throws when the contract is violated. */
export function assertPackageSelector(value: string, label: string): void {
	if (value.endsWith('/')) {
		const base = value.slice(0, -1);
		if (!/^@[a-z0-9][a-z0-9._~-]*$/i.test(base)) {
			throw new Error(`${label} must be a package name or scoped prefix ending in /`);
		}
		return;
	}
	assertPackageName(value, label);
}

/** Validates public package subpath and throws when the contract is violated. */
export function assertPublicPackageSubpath(value: string, label: string): void {
	if (value === '.') return;
	if (
		!value.startsWith('./') ||
		value.length === 2 ||
		value.includes('\\') ||
		value.split('/').includes('..') ||
		/[?#]/.test(value)
	) {
		throw new Error(`${label} must be a public package export subpath`);
	}
}

/** Reads a selectors from its source representation. */
export function readSelectors(value: unknown, label: string): readonly string[] {
	if (value === undefined) return Object.freeze([]);
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
	const seen = new Set<string>();
	const result = value.map((raw, index) => {
		const selector = requiredString(raw, `${label}[${index}]`);
		assertPackageSelector(selector, `${label}[${index}]`);
		if (seen.has(selector)) throw new Error(`${label} contains duplicate selector ${selector}`);
		seen.add(selector);
		return selector;
	});
	return Object.freeze(result);
}

/** Reports whether package selectors. */
export function matchesPackageSelectors(
	packageName: string,
	selectors: readonly string[]
): boolean {
	return selectors.some((selector) =>
		selector.endsWith('/') ? packageName.startsWith(selector) : packageName === selector
	);
}

/** Validates an npm package name used in plugin metadata. */
export function assertPackageName(value: string, label: string): void {
	if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i.test(value)) {
		throw new Error(`${label} must be a bare package name`);
	}
}

/** Reads a required non-empty string field from untrusted package metadata. */
export function requiredString(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${label} must be a non-empty string`);
	return value;
}

/** Reads an optional object field while rejecting arrays and primitive values. */
export function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	return requiredRecord(value, label);
}

/** Reads a required object field from untrusted package metadata. */
export function requiredRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`);
	return value;
}

/** Reports whether an unknown value is a non-array object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects undeclared keys so misspelled plugin metadata cannot be ignored silently. */
export function assertOnlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string
): void {
	const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unsupported.length)
		throw new Error(`${label} contains unsupported fields: ${unsupported.join(', ')}`);
}
