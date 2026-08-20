import type {} from '@exactjs/config';

/** Configures one explicitly exposed component root. */
export type ExactRemoteExposureConfig = {
	component: string;
};

/** Configures the browser and private-server locations for a trusted remote. */
export type ExactRemoteBindingConfig = {
	endpoint: string;
	clientEntry: string;
	/** Browser-enforced SRI metadata for the canonical generated client entry. */
	integrity?: string;
	clientEntryResolver?: string;
};

/** Configures trusted eXact microfrontend production and consumption. */
export type ExactMicrofrontendConfig = {
	exposes: Record<string, ExactRemoteExposureConfig>;
	remotes: Record<string, ExactRemoteBindingConfig>;
	providedPackages: string[];
};

declare module '@exactjs/config' {
	interface ExactPluginConfigRegistry {
		microfrontends: ExactMicrofrontendConfig;
	}
}

export {};
