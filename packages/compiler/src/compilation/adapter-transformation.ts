import {
	profileTimestamp,
	publishExactProfile,
	type ExactProfileEvent
} from '@exactjs/instrumentation';
import type { TransformOptions, TransformResult } from '../contracts/transform.js';
import { transformSource } from './transformation.js';

type SourceOutput = {
	code: string;
	map?: unknown;
};

type AdapterTransformationOptions<Inspection> = {
	source: string;
	filename: string;
	/** Original tool identifier used only for contextual error reporting. */
	errorId?: string;
	jsxOwnership: 'exact' | 'react' | 'unknown';
	usesReactRuntimeImports: boolean;
	/** Whether this React-owned module contains JSX that this adapter must lower. */
	transformReact: boolean;
	shouldCompile: boolean;
	invalidateCompatibility?(): void;
	react?(): SourceOutput;
	compiler: {
		options: TransformOptions;
		finish?(result: TransformResult): SourceOutput;
		inspection?(result: TransformResult): Inspection | undefined;
	};
	compatibility?(): SourceOutput & {
		changed: boolean;
		diagnostics?: readonly { severity: string; message: string }[];
	};
	warn?(message: string): void;
	profile?: {
		subsystem: string;
		sink(event: ExactProfileEvent<string, 'transform'>): void;
	};
};

/**
 * Runs the common build-adapter transform sequence without owning tool lifecycle behavior.
 *
 * Module resolution, invalidation triggers, asset emission, HMR, and DevTools bootstrapping stay
 * with the adapter. This kernel owns only branch selection, compiler invocation, compatibility
 * warning projection, normalized results, timing, and contextual transform failures.
 */
export function transformExactAdapterModule<Inspection = never>(
	options: AdapterTransformationOptions<Inspection>
): (SourceOutput & { inspection?: Inspection }) | null {
	const startedAt = options.profile ? profileTimestamp() : undefined;
	try {
		options.invalidateCompatibility?.();
		const reactOwned =
			options.jsxOwnership === 'react' ||
			(options.jsxOwnership === 'unknown' && options.usesReactRuntimeImports);
		if (reactOwned && options.transformReact) {
			if (!options.react) return null;
			return options.react();
		}
		if (options.shouldCompile) {
			const compiled = transformSource(options.source, {
				...options.compiler.options,
				filename: options.filename
			});
			const output = options.compiler.finish?.(compiled) ?? compiled;
			const inspection = options.compiler.inspection?.(compiled);
			return { ...output, ...(inspection === undefined ? {} : { inspection }) };
		}
		if (!options.compatibility) return null;
		const rewritten = options.compatibility();
		for (const diagnostic of rewritten.diagnostics ?? [])
			if (diagnostic.severity === 'warning') options.warn?.(diagnostic.message);
		return rewritten.changed ? { code: rewritten.code, map: rewritten.map } : null;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`eXact JSX transform failed for ${options.errorId ?? options.filename}\n${message}`
		);
	} finally {
		if (startedAt !== undefined && options.profile)
			publishExactProfile(
				options.profile.sink,
				Object.freeze({
					subsystem: options.profile.subsystem,
					phase: 'transform',
					elapsedMs: profileTimestamp() - startedAt,
					attributes: Object.freeze({ filename: options.filename })
				})
			);
	}
}
