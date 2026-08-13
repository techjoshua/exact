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

/** One alias target accepted by webpack's resolver configuration. */
export type WebpackAliasTarget = string | false | string[];

/** Object and ordered-entry forms accepted by webpack's resolver configuration. */
export type WebpackAliasConfiguration =
	| Record<string, WebpackAliasTarget>
	| { alias: WebpackAliasTarget; name: string; onlyModule?: boolean }[];
/** Minimal resolver surface used by the Webpack adapter without coupling shared logic to Webpack internals. */
export type WebpackResolverLike = {
	hooks?: {
		resolve?: {
			tapAsync?(
				name: string,
				handler: (
					request: WebpackResolveRequest,
					context: unknown,
					callback: WebpackResolveCallback
				) => void
			): void;
		};
	};
	ensureHook?(name: string): unknown;
	getHook?(name: string): {
		tapAsync?(
			name: string,
			handler: (
				request: WebpackResolveRequest,
				context: unknown,
				callback: WebpackResolveCallback
			) => void
		): void;
	};
	doResolve?(
		hook: unknown,
		request: WebpackResolveRequest,
		message: string,
		context: unknown,
		callback: WebpackResolveCallback
	): void;
};
