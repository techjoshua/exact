const enhancementFacadePrefix = 'exact:optional-enhancement/';

/** One compiler-authored request for a target-local optional enhancement provider facade. */
export type ExactEnhancementFacadeRequest = Readonly<{
	version: 1;
	identity: string;
	moduleSpecifier: string;
	exportName: string;
}>;

/** Encodes a provider request without making its generated spelling runtime identity. */
export function exactEnhancementFacadeRequest(
	request: Omit<ExactEnhancementFacadeRequest, 'version'>
): string {
	validateRequest({ version: 1, ...request });
	const encoded = Buffer.from(JSON.stringify({ version: 1, ...request }), 'utf8').toString(
		'base64url'
	);
	return `${enhancementFacadePrefix}${encoded}`;
}

/** Decodes and validates one compiler-authored optional-provider request. */
export function parseExactEnhancementFacadeRequest(
	specifier: string
): ExactEnhancementFacadeRequest | undefined {
	if (!specifier.startsWith(enhancementFacadePrefix)) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(
			Buffer.from(specifier.slice(enhancementFacadePrefix.length), 'base64url').toString('utf8')
		);
	} catch {
		throw new TypeError(`Malformed eXact enhancement facade request ${specifier}`);
	}
	validateRequest(value);
	return Object.freeze(value);
}

/** Emits a facade that statically selects one resolved provider export. */
export function exactAvailableEnhancementFacadeSource(
	request: ExactEnhancementFacadeRequest,
	activationModule?: string
): string {
	validateRequest(request);
	return `${enhancementActivationSource(activationModule)}${
		request.exportName === 'default'
			? `export { default } from ${JSON.stringify(request.moduleSpecifier)};\n`
			: `export { ${request.exportName} as default } from ${JSON.stringify(request.moduleSpecifier)};\n`
	}`;
}

/** Emits the shared zero-instance result for an unavailable optional provider. */
export function exactUnavailableEnhancementFacadeSource(activationModule?: string): string {
	return `${enhancementActivationSource(activationModule)}export { exactEnhancementPassThrough as default } from '@exactjs/core/runtime/enhancements';\n`;
}

function enhancementActivationSource(moduleSpecifier: string | undefined): string {
	return moduleSpecifier ? `import ${JSON.stringify(moduleSpecifier)};\n` : '';
}

function validateRequest(value: unknown): asserts value is ExactEnhancementFacadeRequest {
	if (!value || typeof value !== 'object')
		throw new TypeError('Invalid enhancement facade request');
	const request = value as Partial<ExactEnhancementFacadeRequest>;
	if (
		request.version !== 1 ||
		typeof request.identity !== 'string' ||
		!request.identity ||
		typeof request.moduleSpecifier !== 'string' ||
		!request.moduleSpecifier ||
		typeof request.exportName !== 'string' ||
		!/^[$A-Z_a-z][$\w]*$/.test(request.exportName)
	)
		throw new TypeError('Invalid enhancement facade request');
	if (
		Object.keys(request).some(
			(key) => !['version', 'identity', 'moduleSpecifier', 'exportName'].includes(key)
		)
	)
		throw new TypeError('Invalid enhancement facade request');
}
