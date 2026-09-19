import {
	isExactEnhancementPassThrough,
	readExactEnhancementContexts,
	type AnyComponentInstance
} from '@exactjs/core';
import {
	assertEnhancementSourceOrder,
	assertSingleSuppliedPlacement,
	prepareTextTargetOutput
} from '@exactjs/core/framework/render-structure';
import {
	boundOperationEnhancement,
	selectSsrEnhancementTargets
} from './bound-enhancement-targets.js';
import {
	renderDirectSsrContent,
	type DirectSsrComponentContent
} from './direct-component-content.js';
import { withRenderCleanup, type RenderValue } from './execution.js';
import type { ServerArtifactExecution } from './server-artifact-context.js';
import type { ServerComponentReference } from './server-component-reference.js';

/**
 * Binds incoming namespaces to prepared authored output for one request-owned component attempt.
 * Descendant component implementations remain opaque until their own normal execution. Bindings
 * are removed after completion, rejection, or retry, before the component's resources are released.
 */
export function renderComponentEnhancementBindings<Publication>(
	execution: ServerArtifactExecution<Publication>,
	reference: ServerComponentReference,
	content: DirectSsrComponentContent,
	owner: AnyComponentInstance | undefined
): RenderValue<string> {
	if (
		reference.contract.artifact.capabilities.includes('targets') &&
		!readExactEnhancementContexts(reference.contract.artifact.instantiate)?.transparentTarget
	)
		assertSingleSuppliedPlacement(
			content.children ?? [content.program],
			reference.children.length ? reference.children : reference.props.children
		);
	const enhancement = boundOperationEnhancement(
		execution.context,
		reference,
		reference.enhancement,
		true
	);
	if (!enhancement) return renderDirectSsrContent(execution, content, owner);
	let entries = enhancement.entries;
	if (entries.length === 1) {
		const entry = entries[0]!;
		if (
			entry.root !== undefined ||
			isExactEnhancementPassThrough(execution.context.enhancementCatalog?.get(entry.identity))
		)
			return renderDirectSsrContent(execution, content, owner);
	} else {
		entries = entries.filter(
			(entry) =>
				entry.root === undefined &&
				!isExactEnhancementPassThrough(execution.context.enhancementCatalog?.get(entry.identity))
		);
	}
	if (!entries.length) return renderDirectSsrContent(execution, content, owner);
	if (entries.length > 1) {
		const available = entries.filter((entry) =>
			execution.context.enhancementCatalog?.has(entry.identity)
		);
		assertEnhancementSourceOrder(available, execution.context.enhancementCatalog ?? new Map());
	}
	// A closed intrinsic program with no structural slots cannot contain another explicit
	// destination. Bind that root directly instead of allocating a candidate traversal.
	if (content.program && !content.program.program.targetSlots?.length) {
		if (!execution.prepareOutput) return renderDirectSsrContent(execution, content, owner, entries);
		const program = content.program;
		const bindings = (execution.context.boundEnhancementTargets ??= new WeakMap());
		const previous = bindings.get(program);
		bindings.set(program, entries);
		return withRenderCleanup(
			() => renderDirectSsrContent(execution, content, owner),
			() => {
				if (previous) bindings.set(program, previous);
				else bindings.delete(program);
			}
		);
	}
	if (content.children) content = { children: prepareTextTargetOutput(content.children) };
	const targets = selectSsrEnhancementTargets(
		content.children ?? [content.program],
		entries,
		reference.children.length ? reference.children : reference.props.children
	);
	const bindings = (execution.context.boundEnhancementTargets ??= new WeakMap());
	const previous = new Map([...targets.keys()].map((key) => [key, bindings.get(key)]));
	for (const [key, selected] of targets) bindings.set(key, selected);
	return withRenderCleanup(
		() => renderDirectSsrContent(execution, content, owner),
		() => {
			for (const [key, value] of previous) {
				if (value) bindings.set(key, value);
				else bindings.delete(key);
			}
		}
	);
}
