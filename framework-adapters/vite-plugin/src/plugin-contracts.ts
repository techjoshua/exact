import type { ExactAssetRule, TransformTarget } from '@exactjs/compiler';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { ReactCompatibilityOptions } from '@exactjs/react-compat/plugin';
import type { ExactRollupOutputLike } from './artifact-isolation.js';
import type { ViteDebugOptions } from './debug-output.js';

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Configures the eXact Vite plugin and its compiler integrations. */
export type ExactPluginOptions = {
	include?: FilterPattern;
	exclude?: FilterPattern;
	target?: TransformTarget;
	clientCondition?: string;
	serverCondition?: string;
	serverComponents?: boolean;
	sourceMap?: boolean;
	reactCompatibility?: boolean | ReactCompatibilityOptions;
	applicationRoot?: string;
	configPath?: string;
	assetRules?: readonly ExactAssetRule[];
	diagnostics?: boolean;
	configureJsxRuntime?: boolean;
	compileTestModules?: boolean;
	onProfile?: ExactProfileSink;
	onRemoteEntries?: (entries: Readonly<Record<string, string>>) => void;
	onRemoteDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
	/** Derives server catalog emission and compact client runtime correlation together. */
	debug?: ExactViteDebugOptions;
};

/** Higher-level build controls for server-cooperative DevTools output. */
export type ExactViteDebugOptions = ViteDebugOptions;

/** Reports an observable eXact Vite profile event. */
export type ExactViteProfileEvent = ExactProfileEvent<'vite-plugin', 'transform'>;

/** Defines the Vite hooks implemented by the eXact plugin. */
export type ExactPlugin = {
	name: string;
	enforce: 'pre';
	warn?(message: string): void;
	config?(): {
		resolve: { conditions: string[]; alias?: Array<{ find: RegExp; replacement: string }> };
		oxc?: {
			jsx: {
				runtime: 'automatic';
				importSource: '@exactjs/jsx';
			};
		};
	};
	configResolved?(config: { command: 'build' | 'serve' }): void;
	buildStart?(this: {
		addWatchFile(file: string): void;
		warn?(message: string): void;
		emitFile?(file: {
			type: 'chunk' | 'asset';
			id?: string;
			name?: string;
			fileName?: string;
			source?: string;
			preserveSignature?: 'strict';
		}): string;
	}): void | Promise<void>;
	configureServer?(server: {
		httpServer?: { once(event: 'close', listener: () => void): unknown };
		watcher?: { once(event: 'close', listener: () => void): unknown };
	}): void;
	resolveId?(
		this: {
			warn?(message: string): void;
			addWatchFile?(file: string): void;
			resolve?(
				source: string,
				importer?: string,
				options?: { skipSelf?: boolean }
			): Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>;
		},
		source: string,
		importer?: string
	):
		| string
		| { id: string; external?: boolean | 'absolute' | 'relative' }
		| null
		| Promise<string | { id: string; external?: boolean | 'absolute' | 'relative' } | null>;
	load?(
		id: string
	):
		| string
		| { code: string; moduleType: 'js' | 'jsx' | 'ts' | 'tsx' }
		| null
		| Promise<string | { code: string; moduleType: 'js' | 'jsx' | 'ts' | 'tsx' } | null>;
	transform(
		this: { warn?(message: string): void },
		code: string,
		id: string
	): { code: string; map: unknown; moduleType?: 'js' } | null;
	handleHotUpdate?(this: { warn?(message: string): void }, context: { file: string }): void;
	watchChange?(
		this: { warn?(message: string): void },
		id: string,
		change: { event: 'create' | 'update' | 'delete' }
	): void | Promise<void>;
	transformIndexHtml?: {
		order: 'pre';
		handler(html: string): string;
	};
	generateBundle?(
		this: {
			emitFile?(file: { type: 'asset'; fileName: string; source: string }): string;
		},
		_options: unknown,
		bundle: Readonly<Record<string, ExactRollupOutputLike>>
	): void | Promise<void>;
	closeBundle?(): void;
};
