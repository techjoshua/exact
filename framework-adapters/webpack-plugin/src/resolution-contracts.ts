/** Defines the Webpack resolve request shape used by eXact resolver hooks. */
export type WebpackResolveRequest = {
	request?: string;
	path?: string;
};

/** Resolved NormalModuleFactory record available before the module build begins. */
export type WebpackAfterResolveData = Readonly<{
	request?: string;
	contextInfo?: Readonly<{ issuer?: string }>;
	createData?: { resource?: string; rawRequest?: string };
}>;

/** Callback used by enhanced-resolve hook adapters. */
export type WebpackResolveCallback = (error?: Error | null, result?: unknown) => void;
