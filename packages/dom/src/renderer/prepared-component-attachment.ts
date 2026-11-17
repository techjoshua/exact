import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render-operations';
import { retainSuppliedPlacement } from './supplied-placement-capability.js';
import {
	attachSuppressedCleanupFailure,
	withComponentDomain,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import {
	exactCompiledClientAttachment,
	exactCompiledDirectProgramAttachment,
	type ExactCompiledDirectProgramTarget,
	exactCompatibilityClientAttachment,
	type ExactClientComponentArtifact,
	type ExactCompiledClientAttachmentTarget,
	type ExactCompatibilityClientAttachmentTarget
} from '@exactjs/core/runtime/component-operations';
import type { Mounted, Root } from '../types.js';
import { withEffectScope } from '@exactjs/reactive/framework/runtime';
import { unmountMounted } from './teardown.js';

/** Captured output retains its typed finite root until the receiving presentation consumes it. */
export type PreparedComponentOutput = Child[] | ExactRenderProgramInvocation;
/** Projects captured output without executing the component render a second time. */
export type PreparedComponentProjection = (
	output: PreparedComponentOutput
) => PreparedComponentOutput;

type AttachmentTarget = Partial<ExactCompiledDirectProgramTarget> &
	ExactCompiledClientAttachmentTarget &
	ExactCompatibilityClientAttachmentTarget;

/**
 * Owns a constructed component until its captured output is committed or abandoned.
 * Capturing executes the compiled output once, without mounting descendants or publishing refs.
 * Use within one synchronous preparation transaction; asynchronous preparation needs generation fencing.
 */
export class PreparedComponentAttachment {
	/** Preparation belongs to the existing receiving renderer root. */
	constructor(private readonly root: Root) {}
	private phase: 'preparing' | 'ready' | 'committing' | 'committed' | 'aborted' = 'preparing';

	private mounted?: Mounted;
	private target?: AttachmentTarget;
	private children?: PreparedComponentOutput;

	private compatibility = false;
	private finish?: () => void;
	private mode: 'mount' | 'hydrate' = 'mount';

	/** Exposes the already constructed owner to renderer preparation of dependent descendants. */
	get owner(): AnyComponentInstance {
		return this.ownedRange.instance!;
	}

	/** Retains the unpublished mount's lifecycle owner until attachment transfers it. */
	get ownedRange(): Mounted {
		if (this.phase !== 'ready' || !this.mounted)
			throw new Error('Prepared component ownership is not available');
		return this.mounted;
	}

	/** Returns the captured native output; compatibility islands remain opaque to native planners. */
	get output(): PreparedComponentOutput {
		if (this.phase !== 'ready' || !this.children)
			throw new Error('Native component output is not available for preparation');
		return this.children;
	}

	/** Registers lifecycle ownership before construction so failed attempts can be released. */
	own(mounted: Mounted): void {
		if (this.mounted || this.phase !== 'preparing')
			throw new Error('Component preparation already owns a range');
		this.mounted = mounted;
	}

	/** Captures one artifact attachment while retaining the eventual renderer target. */
	capture(
		artifact: ExactClientComponentArtifact,
		instance: AnyComponentInstance,
		target: AttachmentTarget,
		finish: () => void,
		mode: 'mount' | 'hydrate' = 'mount'
	): void {
		if (this.phase !== 'preparing' || this.target || this.mounted?.instance !== instance)
			throw new Error('Component preparation cannot capture this instance');
		this.target = target;
		this.finish = finish;
		this.mode = mode;
		artifact.attach(instance, this, mode);
		if (!this.children && !this.compatibility)
			throw new Error('Component artifact did not supply an attachment');
		this.phase = 'ready';
	}

	/** Accepts the artifact's already-executed native output without mounting it. */
	[exactCompiledClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		children: Child[],
		mode: 'mount' | 'hydrate'
	): Mounted {
		this.assertCapture(artifact, instance, mode);
		retainSuppliedPlacement(this.mounted!, children, this.root);
		this.children = children;
		return this.mounted!;
	}

	/** Captures a typed finite invocation without turning it into a generic child operation. */
	[exactCompiledDirectProgramAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		invocation: ExactRenderProgramInvocation,
		mode: 'mount' | 'hydrate'
	): Mounted {
		this.assertCapture(artifact, instance, mode);
		if (invocation.owner !== instance)
			throw new TypeError('Direct output capture has a different owner');
		this.children = invocation;
		return this.mounted!;
	}

	/** Retains foreign output as an opaque renderer-owned attachment. */
	[exactCompatibilityClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: 'mount' | 'hydrate'
	): Mounted {
		this.assertCapture(artifact, instance, mode);
		this.compatibility = true;
		return this.mounted!;
	}

	/**
	 * Mounts captured output once and transfers cleanup ownership to the returned range. An optional
	 * native projection plans its presentation in the component scope before descendant attachment.
	 * It must preserve child ownership; it cannot instantiate the component again. Projection failure
	 * abandons the prepared owner and its resources without publishing descendants.
	 */
	commit(
		presentation: AttachmentTarget = this.target!,
		project?: PreparedComponentProjection,
		mode: 'mount' | 'hydrate' = this.mode
	): Mounted {
		if (this.phase !== 'ready' || !this.mounted || !this.mounted.scope.active)
			throw new Error('Component preparation is not ready to commit');
		const mounted = this.mounted;
		this.phase = 'committing';
		try {
			if (project && this.compatibility)
				throw new TypeError('Native output projection cannot inspect a compatibility island');
			const children = project
				? withEffectScope(mounted.instance!.scope, () =>
						withComponentDomain(mounted.instance!.domain, () => project(this.children!))
					)
				: this.children;
			if (children && !Array.isArray(children)) {
				const attach = presentation[exactCompiledDirectProgramAttachment];
				if (!attach)
					throw new TypeError(
						'The receiving presentation does not support direct compiled regions'
					);
				attach.call(presentation, mounted.clientArtifact!, mounted.instance!, children, mode);
			} else if (this.compatibility)
				presentation[exactCompatibilityClientAttachment](
					mounted.clientArtifact!,
					mounted.instance!,
					mode
				);
			else
				presentation[exactCompiledClientAttachment](
					mounted.clientArtifact!,
					mounted.instance!,
					children as Child[],
					mode
				);
			this.finish!();
			this.phase = 'committed';
			this.clear();
			return mounted;
		} catch (error) {
			try {
				this.abort();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
	}

	/** Abandons an unpublished instance and its resources; committed ranges belong to the renderer. */
	abort(): void {
		if (this.phase === 'committed' || this.phase === 'aborted') return;
		this.phase = 'aborted';
		const mounted = this.mounted;
		this.clear();
		if (mounted) unmountMounted(mounted);
	}

	private assertCapture(
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: string
	): void {
		if (
			this.phase !== 'preparing' ||
			this.children ||
			this.compatibility ||
			mode !== this.mode ||
			artifact !== this.mounted?.clientArtifact ||
			instance !== this.mounted?.instance
		)
			throw new TypeError('Component preparation received an incompatible or duplicate attachment');
	}

	private clear(): void {
		this.mounted = undefined;
		this.target = undefined;
		this.children = undefined;

		this.finish = undefined;
	}
}
