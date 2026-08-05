/** Compact build identity shared by paired artifacts after bundler authorization. */
export type ExactComponentAuthorizationIdentity = Readonly<{
	protocol: 1;
	buildKey: string;
	fingerprint: string;
}>;

/** Validates the compact, provenance-free authorization identity allowed at runtime. */
export function isExactComponentAuthorizationIdentity(
	value: unknown
): value is ExactComponentAuthorizationIdentity {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		Object.keys(record).every((key) => ['protocol', 'buildKey', 'fingerprint'].includes(key)) &&
		record.protocol === 1 &&
		typeof record.buildKey === 'string' &&
		record.buildKey.length > 0 &&
		record.buildKey.length <= 256 &&
		typeof record.fingerprint === 'string' &&
		record.fingerprint.length > 0 &&
		record.fingerprint.length <= 256 &&
		/^[A-Za-z0-9_-]+$/.test(record.fingerprint)
	);
}

/** Requires two coordinated runtime artifacts to carry the same authorization decision. */
export function sameExactComponentAuthorization(
	left: ExactComponentAuthorizationIdentity,
	right: ExactComponentAuthorizationIdentity
): boolean {
	return (
		left.protocol === right.protocol &&
		left.buildKey === right.buildKey &&
		left.fingerprint === right.fingerprint
	);
}
