import { createServerFragmentTargetProjection as createFragmentTargetProjection } from '@exactjs/core/framework/server-render-structure';
import { readDirectSsrContent } from './direct-component-content.js';
import type { ServerArtifactExecution } from './server-artifact-context.js';
import { executeSynchronousArtifact } from './synchronous-artifact.js';
import type { AnyComponentInstance } from '@exactjs/core';
import { readPreparedExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import {
	exactServerDispose,
	exactServerIssue,
	exactServerWrite,
	type ExactHtmlWriter,
	type ExactRequestExecution,
	type ExactServerComponentArtifact,
	type ExactServerFrame
} from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { renderComponentEnhancementBindings } from './component-enhancement-bindings.js';
import { checkpointBoundEnhancementTarget } from './bound-enhancement-targets.js';
import type {
	DirectIssuedRender,
	DirectScheduledSsrComponent,
	DirectSsrComponentPublisher
} from './direct-component-contracts.js';
import {
	createDirectScheduledSsrComponent,
	prepareDirectScheduledSsrComponentReferences,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { RenderValue } from './execution.js';
import { mapRenderValue } from './execution.js';
import { checkpointDocumentHost, restoreDocumentHost } from './host.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import {
	checkpointTargetReceiptLayers,
	restoreTargetReceiptLayers
} from './receipt-target-contributions.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import {
	receiptExecutionBlueprint,
	receiptExecutionContract,
	serverComponentProps,
	type ServerComponentReference
} from './server-component-reference.js';

type IssuedScheduledServerComponent = ExactServerFrame & {
	readonly artifact: ExactServerComponentArtifact;
	readonly checkpoint: unknown;
	readonly parent: AnyComponentInstance | undefined;
	readonly props: Record<string, unknown>;
	resumptionCheckpoint?: number;
	resumptionToken?: number;
	readonly scheduled: DirectScheduledSsrComponent;
	readonly reference: ServerComponentReference;
	disposed: boolean;
	deferredScheduledDisposal?: boolean;
	preparation?: DirectIssuedRender['preparation'];
};

/**
 * Executes one native server component exclusively through its target-local artifact methods.
 * Issuance owns request state before serialization begins; disposal is attempted exactly once and
 * cleanup failure never replaces the primary render failure.
 */
export function renderServerComponentArtifactOutput<Publication>(
	context: SsrContext,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: ServerArtifactExecution<Publication>['renderChildren'],
	renderOwnedComponent: ServerArtifactExecution<Publication>['renderOwnedComponent'],
	publish: DirectSsrComponentPublisher<Publication>,
	publication: Publication
): RenderValue<string | undefined> {
	const contract = receiptExecutionContract(reference);
	const artifact = contract.artifact;
	const props = serverComponentProps(reference);
	if (artifact.selection) {
		return mapRenderValue(artifact.selection.resolve(), (selected) =>
			renderServerComponentArtifactOutput(
				context,
				{
					...reference,
					contract: readPreparedExactServerExecutableComponentContract(selected)
				},
				parent,
				options,
				renderChildren,
				renderOwnedComponent,
				publish,
				publication
			)
		);
	}
	if (artifact.execution.lane !== 'direct') return undefined;
	const execution = {
		context,
		prepareOutput: context.preparedComponentOutputs?.get(reference),
		options,
		publication,
		publish,
		renderChildren,
		renderOwnedComponent,
		renderOwner: undefined,
		renderProgramSegment: renderExecutionProgramSegment,
		prepareProgramReferences: prepareExecutionProgramReferences
	} satisfies ServerArtifactExecution<Publication>;
	if (reference.fragmentTarget) {
		let project: ReturnType<typeof createFragmentTargetProjection> | undefined;
		execution.prepareOutput = (content, owner) => {
			project ??= createFragmentTargetProjection(
				reference.fragmentTarget!.supplied,
				reference.fragmentTarget!.tag,
				owner
			);
			const projected = project(
				content.children ?? [content.program as unknown as import('@exactjs/core').Child]
			);
			return content.program ? readDirectSsrContent(projected[0]) : { children: projected };
		};
	}
	if (artifact.execution.classification === 'synchronous')
		return executeSynchronousArtifact(execution, contract, reference, parent, props);
	return executeScheduledArtifact(execution, artifact, reference, parent, props);
}

/** Shared program forwarding retains the selected owner on this component's execution. */
function renderExecutionProgramSegment<Publication>(
	this: ServerArtifactExecution<Publication>,
	value: unknown
): RenderValue<string> {
	return Array.isArray(value)
		? this.renderChildren(value, this.renderOwner)
		: this.renderOwnedComponent(value as ServerComponentReference, this.renderOwner);
}

/** Prepares siblings under the same component owner without a per-content forwarding closure. */
function prepareExecutionProgramReferences<Publication>(
	this: ServerArtifactExecution<Publication>,
	values: readonly unknown[]
): AsyncDisposable | undefined {
	return prepareDirectScheduledSsrComponentReferences(
		this.context,
		values as readonly ServerComponentReference[],
		this.renderOwner,
		this.options
	);
}

async function executeScheduledArtifact<Publication>(
	execution: ServerArtifactExecution<Publication>,
	artifact: ExactServerComponentArtifact,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	props: Record<string, unknown>
): Promise<string> {
	const context = execution.context;
	const blueprint = receiptExecutionBlueprint(reference);
	const frame = (await artifact.issue.call(
		artifact,
		createRequestExecution(execution, blueprint, reference),
		parent,
		props
	)) as IssuedScheduledServerComponent;
	const output = createHtmlWriter(execution);
	let primary: unknown = noPrimaryFailure;
	try {
		await artifact.write.call(artifact, frame, output.writer);
		return output.read();
	} catch (error) {
		primary = error;
		if (frame.resumptionCheckpoint !== undefined)
			execution.options.resumptionCapture?.rollback(frame.resumptionCheckpoint);
		context.onComponentAttemptRollback?.(frame.checkpoint);
		throw error;
	} finally {
		await disposeAsyncPreservingPrimary(
			() =>
				Promise.resolve(
					artifact.dispose.call(
						artifact,
						frame,
						primary === noPrimaryFailure ? 'ssr render complete' : primary
					)
				),
			primary
		);
	}
}

function createRequestExecution<Publication>(
	execution: ServerArtifactExecution<Publication>,
	blueprint: SsrComponentExecutionBlueprint,
	reference: ServerComponentReference
): ExactRequestExecution {
	return {
		async [exactServerIssue](artifact, parent, props) {
			assertArtifact(artifact, blueprint.contract.artifact);
			const owner = parent as AnyComponentInstance | undefined;
			const scheduled = await (takePreparedDirectScheduledSsrComponent(
				execution.context,
				reference
			) ??
				createDirectScheduledSsrComponent(
					execution.context,
					blueprint,
					props,
					owner,
					execution.options
				));
			if (!scheduled)
				throw new TypeError('Scheduled server artifact did not issue a request-local frame');
			const checkpoint = execution.context.onComponentAttemptCheckpoint?.();
			execution.context.onDirectComponentCreated?.(scheduled.snapshot);
			return createIssuedFrame({
				artifact,
				checkpoint,
				parent: owner,
				props: scheduled.props,
				scheduled,
				reference
			});
		}
	};
}

function createIssuedFrame(
	frame: Omit<IssuedScheduledServerComponent, keyof ExactServerFrame | 'disposed'>
): IssuedScheduledServerComponent {
	const issued: IssuedScheduledServerComponent = {
		...frame,
		disposed: false,
		async [exactServerDispose](artifact: ExactServerComponentArtifact) {
			assertArtifact(artifact, frame.artifact);
			if (issued.disposed) return;
			issued.disposed = true;
			if (issued.preparation) {
				const preparation = issued.preparation;
				issued.preparation = undefined;
				await preparation[Symbol.asyncDispose]();
			}
			if (!issued.deferredScheduledDisposal) await frame.scheduled[Symbol.asyncDispose]();
		}
	};
	return issued;
}

function createHtmlWriter<Publication>(
	execution: ServerArtifactExecution<Publication>
): Readonly<{ writer: ExactHtmlWriter; read(): string }> {
	let output: string | undefined;
	return {
		writer: {
			async [exactServerWrite](artifact, candidate) {
				const frame = candidate as IssuedScheduledServerComponent;
				assertArtifact(artifact, frame.artifact);
				if (frame.disposed) throw new Error('Cannot write a disposed server component frame');
				output = await writeScheduledFrame(execution, frame);
			}
		},
		read() {
			if (output === undefined)
				throw new Error('Server component artifact completed without output');
			return output;
		}
	};
}

async function writeScheduledFrame<Publication>(
	execution: ServerArtifactExecution<Publication>,
	frame: IssuedScheduledServerComponent
): Promise<string> {
	frame.resumptionCheckpoint = execution.options.resumptionCapture?.checkpoint();
	frame.resumptionToken = execution.options.resumptionCapture?.reserveDirect(
		frame.scheduled.snapshot.componentId,
		frame.scheduled.snapshot.contract
	);
	const scheduled = frame.scheduled;
	const settleDocument =
		execution.options.settleDocumentShell &&
		(execution.context.documentRootSeen || frame.artifact.execution.documentRoot === true);
	if (
		(!execution.options.streamingScheduledComponents || settleDocument) &&
		!frame.artifact.execution.streamingDocument
	) {
		const pending = scheduled.drain();
		if (pending instanceof Promise) await pending;
	}
	for (let pass = 0; pass < execution.context.maxTaskPasses; pass++) {
		const renderCheckpoint = execution.context.onComponentAttemptCheckpoint?.();
		const resumptionCheckpoint = execution.options.resumptionCapture?.checkpoint();
		const targetCheckpoint = checkpointTargetReceiptLayers(execution.context);
		const restoreEnhancementTarget = checkpointBoundEnhancementTarget(
			execution.context,
			frame.reference
		);
		const documentCheckpoint = checkpointDocumentHost(execution.context);
		const candidate = scheduled.render();
		const issued = candidate instanceof Promise ? await candidate : candidate;
		frame.preparation = issued.preparation;
		let primary: unknown = noPrimaryFailure;
		try {
			const rendered = renderComponentEnhancementBindings(
				execution,
				frame.reference,
				issued.content,
				scheduled.owner
			);
			const html = rendered instanceof Promise ? await rendered : rendered;
			if (
				execution.options.streamingScheduledComponents &&
				!(
					settleDocument ||
					(execution.options.settleDocumentShell && execution.context.documentRootSeen)
				)
			) {
				frame.deferredScheduledDisposal = true;
				execution.options.streamingScheduledComponents.push(scheduled);
				return publishFrame(execution, frame, html, scheduled.snapshot);
			}
			const readiness = scheduled.drain();
			if (readiness instanceof Promise ? await readiness : readiness) {
				if (resumptionCheckpoint !== undefined)
					execution.options.resumptionCapture?.rollback(resumptionCheckpoint);
				execution.context.onComponentAttemptRollback?.(renderCheckpoint);
				restoreTargetReceiptLayers(execution.context, targetCheckpoint);
				restoreEnhancementTarget();
				restoreDocumentHost(execution.context, documentCheckpoint);
				continue;
			}
			return publishFrame(execution, frame, html, scheduled.snapshot);
		} catch (error) {
			primary = error;
			if (resumptionCheckpoint !== undefined)
				execution.options.resumptionCapture?.rollback(resumptionCheckpoint);
			execution.context.onComponentAttemptRollback?.(renderCheckpoint);
			restoreTargetReceiptLayers(execution.context, targetCheckpoint);
			restoreEnhancementTarget();
			restoreDocumentHost(execution.context, documentCheckpoint);
			throw error;
		} finally {
			if (frame.preparation) await disposeFramePreparation(frame, primary);
		}
	}
	throw new Error(
		`eXact direct scheduled SSR component did not stabilize after ${execution.context.maxTaskPasses} render passes`
	);
}

function publishFrame<Publication>(
	execution: ServerArtifactExecution<Publication>,
	frame: IssuedScheduledServerComponent,
	html: string,
	snapshot: DirectScheduledSsrComponent['snapshot']
): string {
	const output = execution.publish(
		execution.context,
		frame.reference,
		frame.parent,
		html,
		frame.props,
		snapshot,
		execution.publication
	);
	if (frame.resumptionToken !== undefined)
		execution.options.resumptionCapture?.publishDirect(
			frame.resumptionToken,
			snapshot.host,
			snapshot.state,
			frame.props
		);
	execution.context.onDirectComponentRendered?.(snapshot);
	return output;
}

async function disposeFramePreparation(
	frame: IssuedScheduledServerComponent,
	primary: unknown
): Promise<void> {
	if (!frame.preparation) return;
	const preparation = frame.preparation;
	frame.preparation = undefined;
	await disposeAsyncPreservingPrimary(
		() => Promise.resolve(preparation[Symbol.asyncDispose]()),
		primary
	);
}

function assertArtifact(
	actual: ExactServerComponentArtifact,
	expected: ExactServerComponentArtifact
): void {
	if (actual !== expected)
		throw new TypeError('Server component ABI received a frame owned by another artifact');
}
