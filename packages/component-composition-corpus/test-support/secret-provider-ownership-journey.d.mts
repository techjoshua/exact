/** Checks ordinary environment provider values and cancellation on filesystem-capable hosts. */
export function verifyEnvironmentProviderOwnership(
	api: {
		environmentSecrets: typeof import('../../../plugins/secrets/src/providers.js').environmentSecrets;
		createSecretResolver: typeof import('../../../plugins/secrets/src/server.js').createSecretResolver;
		createSecretsServerExtension: typeof import('../../../plugins/secrets/src/server.js').default;
	},
	root: string
): Promise<true>;

/** Checks inherited metadata and captured initialization signal ownership. */
export function verifySecretContextOwnership(api: {
	createSecretResolver: typeof import('../../../plugins/secrets/src/server.js').createSecretResolver;
}): Promise<true>;
