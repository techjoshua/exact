import { retainSuppliedPlacement } from '../supplied-placement-capability.js';
import { domEnhancementCapability } from '../enhancement-capability.js';
import { type AnyComponentInstance, type Child } from '@exactjs/core';
import {
	exactCompiledClientAttachment,
	exactCompatibilityClientAttachment,
	type ExactClientComponentArtifact
} from '@exactjs/core/runtime/component-operations';
import type { Mounted, Root } from '../../types.js';
import { refreshComponentRoot, rootIntroduction } from '../component-roots.js';
import { requireForeignComponentCapability } from '../foreign-component-capability.js';
import type { PreparedComponentAttachment } from '../prepared-component-attachment.js';

/** Adopts captured output without invoking the component artifact's attachment a second time. */
export function attachPreparedHydratedComponent(
	root: Root,
	attachment: PreparedComponentAttachment,
	adopt: (children: Child[]) => Mounted[] | undefined,
	project?: (children: readonly Child[]) => Child[]
): Mounted {
	const target = new DomClientHydrationTarget(root, attachment.ownedRange, adopt);
	const mounted = attachment.commit(target, project);
	target.finishConstruction();
	return mounted;
}

/** Adopts the output supplied by one artifact through the same attachment ABI used for mounting. */
export function attachHydratedComponent(
	root: Root,
	mounted: Mounted,
	artifact: ExactClientComponentArtifact,
	instance: AnyComponentInstance,
	adopt: (children: Child[]) => Mounted[] | undefined
): boolean {
	const target = new DomClientHydrationTarget(root, mounted, adopt);
	artifact.attach(instance, target, 'hydrate');
	if (!target.attached) return false;
	target.finishConstruction();
	return true;
}

/** One hydration cursor validating artifact identity before it adopts generated output. */
class DomClientHydrationTarget {
	attached = false;
	private constructing = true;
	private invalidatedDuringConstruction = false;

	constructor(
		private readonly root: Root,
		private readonly mounted: Mounted,
		private readonly adopt: (children: Child[]) => Mounted[] | undefined
	) {}

	[exactCompiledClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		children: Child[],
		mode: 'mount' | 'hydrate'
	): Mounted {
		const attached = this.assertAttachment(artifact, instance, mode);
		retainSuppliedPlacement(this.mounted, children);
		return this.attachChildren(attached, children);
	}

	[exactCompatibilityClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: 'mount' | 'hydrate'
	): Mounted {
		const attached = this.assertAttachment(artifact, instance, mode);
		this.attached = requireForeignComponentCapability().hydrate(
			this.root,
			this.mounted,
			artifact,
			attached
		);
		return this.mounted;
	}

	finishConstruction(): boolean {
		this.constructing = false;
		return this.invalidatedDuringConstruction;
	}

	private assertAttachment(
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: 'mount' | 'hydrate'
	): AnyComponentInstance {
		if (
			mode !== 'hydrate' ||
			instance !== this.mounted.instance ||
			artifact !== this.mounted.clientArtifact
		)
			throw new TypeError('Client component attached through an incompatible hydration target');
		return instance as AnyComponentInstance;
	}

	private attachChildren(instance: AnyComponentInstance, children: Child[]): Mounted {
		const capability = domEnhancementCapability();
		if (this.mounted.componentReceipt?.fragmentTarget)
			children = capability!.projectComponent!(this.mounted, children);
		const adopted = capability?.adoptComponent
			? capability.adoptComponent(this.root, this.mounted, children, this.adopt)
			: this.adopt(children);
		if (!adopted) throw new Error('Compiler-owned component output did not match the hydrated DOM');
		this.mounted.children = adopted;
		capability?.invalidate?.(this.mounted);
		refreshComponentRoot(instance, true, rootIntroduction(this.root));
		instance.markMounted();
		this.attached = true;
		return this.mounted;
	}
}
