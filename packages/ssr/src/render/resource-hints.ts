import type { DynamicComponentArtifact } from '@exactjs/core';
import { escapeAttr } from '../html.js';
import type { SsrContext } from '../types.js';

/** Adds one compiler-selected, build-authorized dynamic artifact to request-owned hints. */
export function registerDynamicComponentPreload(context: SsrContext, boundaryId: string): void {
	if (
		!boundaryId ||
		context.dynamicComponentPreloads >= context.maxDynamicComponentPreloads ||
		!context.dynamicComponentArtifacts
	)
		return;
	const artifact = artifactFor(context.dynamicComponentArtifacts, boundaryId);
	if (!validArtifact(artifact)) return;
	const key = `modulepreload:${artifact.url}:${artifact.integrity ?? ''}`;
	if (context.reactResourceKeys.has(key)) return;
	context.reactResourceKeys.add(key);
	context.dynamicComponentPreloads++;
	const attributes = htmlAttributes(artifact);
	context.reactResourceHints.push(
		`<link rel="modulepreload" href="${escapeAttr(artifact.url)}"${attributes}/>`
	);
	const link = linkHeader(artifact);
	context.resourceLinkHeaders.push(link);
	context.onEarlyHints?.(Object.freeze([link]));
}

function artifactFor(
	artifacts: NonNullable<SsrContext['dynamicComponentArtifacts']>,
	id: string
): DynamicComponentArtifact | undefined {
	const map = artifacts as ReadonlyMap<string, DynamicComponentArtifact>;
	return typeof map.get === 'function'
		? map.get(id)
		: (artifacts as Readonly<Record<string, DynamicComponentArtifact>>)[id];
}

function validArtifact(
	value: DynamicComponentArtifact | undefined
): value is DynamicComponentArtifact {
	if (!value?.authorized || !value.immutable || !safeUrl(value.url)) return false;
	return (
		value.integrity === undefined ||
		/^[A-Za-z0-9-]+-[A-Za-z0-9+/=]+(?:\s+[A-Za-z0-9-]+-[A-Za-z0-9+/=]+)*$/.test(value.integrity)
	);
}

function safeUrl(url: string): boolean {
	return (
		!/[\u0000-\u0020\u007f]/.test(url) &&
		((url.startsWith('/') && !url.startsWith('//')) || url.startsWith('https://'))
	);
}

function htmlAttributes(artifact: DynamicComponentArtifact): string {
	return [
		artifact.integrity ? ` integrity="${escapeAttr(artifact.integrity)}"` : '',
		artifact.crossOrigin ? ` crossorigin="${artifact.crossOrigin}"` : '',
		artifact.referrerPolicy ? ` referrerpolicy="${artifact.referrerPolicy}"` : ''
	].join('');
}

function linkHeader(artifact: DynamicComponentArtifact): string {
	return [
		`<${artifact.url}>`,
		'rel=modulepreload',
		artifact.integrity ? `integrity="${artifact.integrity}"` : '',
		artifact.crossOrigin ? `crossorigin=${artifact.crossOrigin}` : '',
		artifact.referrerPolicy ? `referrerpolicy=${artifact.referrerPolicy}` : ''
	]
		.filter(Boolean)
		.join('; ');
}
