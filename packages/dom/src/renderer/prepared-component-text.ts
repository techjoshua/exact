import type { PreparedComponentOutput } from './prepared-component-attachment.js';
import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render-operations';
import { reconcileSelectText } from '../controlled-select.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import { TextComponentProjection } from './text-component-projection.js';
import {
	exactCompiledClientAttachment,
	exactCompiledDirectProgramAttachment,
	exactCompatibilityClientAttachment,
	type ExactClientComponentArtifact
} from '@exactjs/core/runtime/component-operations';
import { watch } from '@exactjs/reactive/framework/runtime';
import { componentMounts } from '../state.js';
import type { Mounted, Root } from '../types.js';
import { refreshComponentRoot, rootIntroduction } from './component-roots.js';

/**
 * Commits native prepared component output as one owned Text presentation. It creates no child
 * elements and publishes no Element refs. An existing SSR Text node must match before adoption.
 * Nested native owners share the Text presentation while retaining their own lifecycles.
 */
export class PreparedComponentTextTarget {
	private claimed = false;
	constructor(
		private readonly root: Root,
		private readonly existing?: Text
	) {}

	/** Activates one reactive text binding against the already constructed component's scope. */
	[exactCompiledClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		children: PreparedComponentOutput,
		mode: 'mount' | 'hydrate'
	): Mounted {
		const owner = instance as AnyComponentInstance;
		const mounted = componentMounts.get(owner);
		if (
			this.claimed ||
			mode !== 'mount' ||
			!mounted ||
			mounted.clientArtifact !== artifact ||
			mounted.children.length
		)
			throw new TypeError('Prepared text attachment does not own this component range');
		if (!Array.isArray(children) && children.owner !== instance)
			throw new TypeError('Direct text output has a different component owner');
		this.claimed = true;
		const text = this.existing ?? document.createTextNode('');
		const projection = new TextComponentProjection(this.root, mounted, text);
		let initial = true;
		watch(
			() => {
				const value = projection.read(children);
				if (initial && this.existing && text.data !== value)
					throw new Error('Prepared component text does not match server output');
				initial = false;
				if (text.data !== value) {
					text.data = value;
					if (text.parentNode) reconcileSelectText(undefined, text.parentNode);
				}
			},
			undefined,
			{ scope: mounted.scope }
		);
		mounted.dom = text;
		mounted.textPresentation = text;
		refreshComponentRoot(this.root, owner, true, rootIntroduction(this.root));
		mounted.afterPlacement = () => owner.markMounted();
		mounted.afterPlacementPhase = 'mount';
		return mounted;
	}

	/** Uses the same owned Text lifetime for a compiler-selected finite invocation. */
	[exactCompiledDirectProgramAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		invocation: ExactRenderProgramInvocation,
		mode: 'mount' | 'hydrate'
	): Mounted {
		return this[exactCompiledClientAttachment](artifact, instance, invocation, mode);
	}

	/** Foreign renderer islands cannot be impersonated by a native text presentation. */
	[exactCompatibilityClientAttachment](): never {
		throw new TypeError('Prepared text requires native component output');
	}
}
