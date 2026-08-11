import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactAssetRule, TransformTarget } from '@exactjs/compiler';
import type { ExactComponentAuthorizationIdentity } from '@exactjs/core';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { IntlBuildConfiguration } from '@exactjs/intl-build';
import type { ReactCompatibilityOptions } from '@exactjs/react-compat/plugin';
import type { ExactPreparedBunRemoteBuild } from './build.js';
import type { ExactBunResolver } from './component-authorization.js';

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Configures the eXact Bun plugin. */
export type ExactBunPluginOptions = {
	target?: TransformTarget;
	clientCondition?: string;
	serverCondition?: string;
	include?: FilterPattern;
	exclude?: FilterPattern;
	compileTestModules?: boolean;
	serverComponents?: boolean;
	sourceMap?: boolean;
	reactCompatibility?: boolean | ReactCompatibilityOptions;
	applicationRoot?: string;
	configPath?: string;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	onProfile?: ExactProfileSink;
	/** @internal Collects the language projection for the shared validation session. */
	__exactLanguageValidation?: boolean;
	/** @internal Package-wide bindings loaded once by the owning build generation. */
	__exactPackageEnhancements?: readonly ExactPackageEnhancementImport[];
	/** Enables shared intl analysis, linking, catalogs, and generated descriptor modules. */
	internationalization?: false | Readonly<IntlBuildConfiguration>;
	/** Independent server catalog and compact runtime controls. */
	debug?: ExactBunDebugOptions;
	onRemoteEntries?: (entries: Readonly<Record<string, string>>) => void;
	onRemoteDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
	/** Compact identity from the paired server build for server-executing remote artifacts. */
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	/** @internal Prepared only by exactBuild(). */
	__exactRemoteBuild?: ExactPreparedBunRemoteBuild;
};

/** Higher-level Bun controls for server-cooperative DevTools output. */
export type ExactBunDebugOptions = {
	catalog?: boolean | 'auto';
	runtime?: boolean | 'auto';
	buildKey?: string;
	executionRoot?: string;
	rootComponentId?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
};

/** Reports an observable eXact Bun profile event. */
export type ExactBunProfileEvent = ExactProfileEvent<'bun-plugin', 'transform'>;

/** Defines the Bun build subset consumed by the plugin. */
export type BunBuildLike = {
	config?: {
		alias?: Readonly<Record<string, string>>;
		conditions?: string | string[];
		watch?: boolean;
		hot?: boolean;
		outdir?: string;
	};
	resolve?: ExactBunResolver;
	onResolve(
		options: { filter: RegExp },
		handler: (
			args: BunResolveArgs
		) => BunResolveResult | undefined | Promise<BunResolveResult | undefined>
	): void;
	onLoad(
		options: { filter: RegExp; namespace?: string },
		handler: (args: BunLoadArgs) => BunLoadResult | undefined | Promise<BunLoadResult | undefined>
	): void;
	onStart?(handler: () => void | Promise<void>): void;
	onEnd?(
		handler: (
			result?: Readonly<{
				success?: boolean;
				logs?: readonly unknown[];
				outputs?: readonly Readonly<{ path: string; kind?: string }>[];
				metafile?: Readonly<{ outputs?: Readonly<Record<string, { entryPoint?: string }>> }>;
			}>
		) => void | Promise<void>
	): void;
};

export type BunResolveArgs = { path: string; importer?: string };
export type BunResolveResult = { path: string; external?: boolean; namespace?: string };
export type BunLoadArgs = { path: string; text?(): Promise<string> };
export type BunLoadResult = { contents: string; loader?: 'js' | 'jsx' | 'ts' | 'tsx' };

/** Defines the Bun plugin contract without requiring Bun's ambient types. */
export type BunPluginLike = { name: string; setup(build: BunBuildLike): void };
