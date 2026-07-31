import { resolveExactArtifactImport } from '@exactjs/compiler';
import {
	resolveReactCompatibility,
	validateInstalledReactReconciler,
	type ResolvedReactCompatibility
} from '@exactjs/react-compat/plugin';
import path from 'node:path';
import type {
	ExactWebpackPluginOptions,
	WebpackCompilerLike,
	WebpackResolverLike
} from './plugin.js';
import { webpackTransformTarget } from './transform-selection.js';

/** Resolves a webpack import request for a .exact facade to a target artifact. */
export function resolveExactWebpackRequest(
	request: string,
	importer: string | undefined,
	options: ExactWebpackPluginOptions = {}
): string | null {
	return resolveExactArtifactImport(request, importer, webpackTransformTarget(options))?.id ?? null;
}

/** Installs .exact facade resolution into a webpack resolver. */
export function applyExactWebpackResolver(
	resolver: WebpackResolverLike,
	options: ExactWebpackPluginOptions = {}
): WebpackResolverLike {
	const resolveHook = resolver.getHook?.('resolve') ?? resolver.hooks?.resolve;
	const targetHook = resolver.ensureHook?.('resolved') ?? resolveHook;
	resolveHook?.tapAsync?.('ExactWebpackPlugin', (request, context, callback) => {
		if (!request.request) return callback();
		const importer = request.path ? path.join(request.path, '__exact_importer.ts') : undefined;
		if (request.request === 'react-reconciler') {
			const compatibility = resolveReactCompatibility(options.reactCompatibility);
			if (compatibility) {
				try {
					validateInstalledReactReconciler(compatibility.target, request.path ?? process.cwd());
				} catch (error) {
					return callback(error instanceof Error ? error : new Error(String(error)));
				}
			}
		}
		const resolved = resolveExactWebpackRequest(request.request, importer, options);
		if (!resolved) return callback();
		const nextRequest = { ...request, request: resolved };
		if (resolver.doResolve && targetHook) {
			resolver.doResolve(
				targetHook,
				nextRequest,
				'resolved eXact target artifact',
				context,
				callback
			);
			return;
		}
		callback(null, nextRequest);
	});
	return resolver;
}

/** Prepends eXact export conditions to webpack's conditionNames list. */
export function addWebpackConditions(
	compiler: WebpackCompilerLike,
	conditions: readonly string[]
): void {
	compiler.options.resolve ??= {};
	const current = compiler.options.resolve.conditionNames ?? [];
	compiler.options.resolve.conditionNames = [
		...conditions,
		...current.filter((condition) => !conditions.includes(condition))
	];
}

/** Adds exact React compatibility aliases without replacing user aliases. */
export function addWebpackReactAliases(
	compiler: WebpackCompilerLike,
	resolved: ResolvedReactCompatibility
): void {
	compiler.options.resolve ??= {};
	const current = compiler.options.resolve.alias ?? {};
	compiler.options.resolve.alias = {
		...Object.fromEntries(
			Object.entries(resolved.aliases).map(([request, replacement]) => [`${request}$`, replacement])
		),
		...current
	};
}
