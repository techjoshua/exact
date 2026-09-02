import type { AnyComponentInstance, Child } from '@exactjs/core';
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
import { renderDirectSsrContent } from './direct-component-content.js';
import type {
	DirectIssuedRender,
	DirectScheduledSsrComponent,
	DirectSsrComponentPublisher
} from './direct-component-contracts.js';
import { executeDirectSsrComponent } from './direct-component.js';
import {
	createDirectScheduledSsrComponent,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import {
	receiptExecutionBlueprint,
	receiptExecutionContract,
	serverComponentProps,
	type ServerComponentReference
} from './server-component-reference.js';
import { renderOperationEnhancementsAsync } from './operation-enhancements.js';
import {
	checkpointTargetReceiptLayers,
	restoreTargetReceiptLayers
} from './receipt-target-contributions.js';

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

type ServerArtifactExecution<Publication> = Readonly<{
	context: SsrContext;
	options: SsrRenderOptions;
	publication: Publication;
	publish: DirectSsrComponentPublisher<Publication>;
	renderChildren(
		children: readonly Child[],
		parent: AnyComponentInstance | undefined
	): Promise<string>;
	renderOwnedComponent(
		component: ServerComponentReference,
		parent: AnyComponentInstance | undefined
	): Promise<string>;
}>;

/**
 * Executes one native server component exclusively through its target-local artifact methods.
 * Issuance owns request state before serialization begins; disposal is attempted exactly once and
 * cleanup failure never replaces the primary render failure.
 */
export async function renderServerComponentArtifactOutput<Publication>(
	context: SsrContext,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: ServerArtifactExecution<Publication>['renderChildren'],
	renderOwnedComponent: ServerArtifactExecution<Publication>['renderOwnedComponent'],
	publish: DirectSsrComponentPublisher<Publication>,
	publication: Publication
): Promise<string | undefined> {
	const contract = receiptExecutionContract(reference);
	const artifact = contract.artifact;
	const props = serverComponentProps(reference);
	if (artifact.selection) {
		const selected = await artifact.selection.resolve();
		return renderServerComponentArtifactOutput(
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
		);
	}
	if (artifact.execution.lane !== 'direct') return undefined;
	const execution = {
		context,
		options,
		publication,
		publish,
		renderChildren,
		renderOwnedComponent
	} satisfies ServerArtifactExecution<Publication>;
	if (artifact.execution.classification === 'synchronous')
		return executeSynchronousArtifact(execution, contract, reference, parent, props);
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
			context.resumptionCapture?.rollback(frame.resumptionCheckpoint);
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
	frame.resumptionCheckpoint = execution.context.resumptionCapture?.checkpoint();
	frame.resumptionToken = execution.context.resumptionCapture?.reserveDirect(
		frame.scheduled.snapshot.componentId,
		frame.scheduled.snapshot.contract
	);
	const scheduled = frame.scheduled;
	for (let pass = 0; pass < execution.context.maxTaskPasses; pass++) {
		const renderCheckpoint = execution.context.onComponentAttemptCheckpoint?.();
		const resumptionCheckpoint = execution.context.resumptionCapture?.checkpoint();
		const targetCheckpoint = checkpointTargetReceiptLayers(execution.context);
		const issued = await scheduled.render();
		frame.preparation = issued.preparation;
		let primary: unknown = noPrimaryFailure;
		try {
			const html = await renderOperationEnhancementsAsync(
				execution.context,
				frame.reference.enhancement,
				() =>
					renderDirectSsrContent(
						execution.context,
						issued.content,
						scheduled.owner,
						execution.renderChildren,
						execution.renderOwnedComponent
					),
				scheduled.owner,
				execution.options,
				(_context, children, parent) => execution.renderChildren(children, parent)
			);
			if (execution.options.streamingScheduledComponents) {
				frame.deferredScheduledDisposal = true;
				execution.options.streamingScheduledComponents.push(scheduled);
				return publishFrame(execution, frame, html, scheduled.snapshot);
			}
			if (await scheduled.drain()) {
				if (resumptionCheckpoint !== undefined)
					execution.context.resumptionCapture?.rollback(resumptionCheckpoint);
				execution.context.onComponentAttemptRollback?.(renderCheckpoint);
				restoreTargetReceiptLayers(execution.context, targetCheckpoint);
				continue;
			}
			return publishFrame(execution, frame, html, scheduled.snapshot);
		} catch (error) {
			primary = error;
			if (resumptionCheckpoint !== undefined)
				execution.context.resumptionCapture?.rollback(resumptionCheckpoint);
			execution.context.onComponentAttemptRollback?.(renderCheckpoint);
			restoreTargetReceiptLayers(execution.context, targetCheckpoint);
			throw error;
		} finally {
			await disposeFramePreparation(frame, primary);
		}
	}
	throw new Error(
		`eXact direct scheduled SSR component did not stabilize after ${execution.context.maxTaskPasses} render passes`
	);
}

async function executeSynchronousArtifact<Publication>(
	execution: ServerArtifactExecution<Publication>,
	contract: import('@exactjs/core/framework/component-contracts').ExactServerExecutableComponentContract,
	reference: ServerComponentReference,
	parent: AnyComponentInstance | undefined,
	props: Record<string, unknown>
): Promise<string> {
	const output = await executeDirectSsrComponent(
		execution.context,
		contract,
		props,
		parent,
		execution.options,
		async (content, owner, preparedProps, snapshot) => {
			const html = await renderOperationEnhancementsAsync(
				execution.context,
				reference.enhancement,
				() =>
					renderDirectSsrContent(
						execution.context,
						content,
						owner,
						execution.renderChildren,
						execution.renderOwnedComponent
					),
				owner,
				execution.options,
				(_context, children, childParent) => execution.renderChildren(children, childParent)
			);
			return execution.publish(
				execution.context,
				reference,
				parent,
				html,
				preparedProps,
				snapshot,
				execution.publication
			);
		}
	);
	if (output === undefined)
		throw new TypeError('Synchronous server artifact did not execute its request-owned sink');
	return output;
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
		execution.context.resumptionCapture?.publishDirect(
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
