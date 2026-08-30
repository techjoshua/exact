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
	DirectSsrComponentPublisher,
	DirectSsrComponentResult
} from './direct-component-contracts.js';
import { renderDirectSsrComponent } from './direct-component.js';
import {
	createDirectScheduledSsrComponent,
	disposeDirectSsrLifetime,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import {
	receiptExecutionBlueprint,
	serverComponentProps,
	type ServerComponentReference
} from './server-component-reference.js';
import { renderOperationEnhancementsAsync } from './operation-enhancements.js';
import {
	checkpointTargetReceiptLayers,
	restoreTargetReceiptLayers
} from './receipt-target-contributions.js';

type IssuedServerComponent = ExactServerFrame & {
	readonly artifact: ExactServerComponentArtifact;
	readonly checkpoint: unknown;
	readonly kind: 'scheduled' | 'synchronous';
	readonly parent: AnyComponentInstance | undefined;
	readonly props: Record<string, unknown>;
	readonly scheduled?: DirectScheduledSsrComponent;
	readonly synchronous?: DirectSsrComponentResult;
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
	const blueprint = receiptExecutionBlueprint(reference);
	const artifact = blueprint.contract.artifact;
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
	const frame = (await artifact.issue.call(
		artifact,
		createRequestExecution(execution, blueprint, reference),
		parent,
		props
	)) as IssuedServerComponent;
	const output = createHtmlWriter(execution);
	let primary: unknown = noPrimaryFailure;
	try {
		await artifact.write.call(artifact, frame, output.writer);
		return output.read();
	} catch (error) {
		primary = error;
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
			if (scheduled) {
				execution.context.onDirectComponentCreated?.(scheduled.snapshot);
				return createIssuedFrame({
					artifact,
					checkpoint: execution.context.onComponentAttemptCheckpoint?.(),
					kind: 'scheduled',
					parent: owner,
					props: scheduled.props,
					scheduled,
					reference
				});
			}
			const synchronous = await renderDirectSsrComponent(
				execution.context,
				blueprint,
				props,
				owner,
				execution.options
			);
			if (!synchronous)
				throw new TypeError('Direct server artifact did not issue a request-local frame');
			execution.context.onDirectComponentCreated?.(synchronous.snapshot);
			return createIssuedFrame({
				artifact,
				checkpoint: execution.context.onComponentAttemptCheckpoint?.(),
				kind: 'synchronous',
				parent: owner,
				props: synchronous.props,
				synchronous,
				reference
			});
		}
	};
}

function createIssuedFrame(
	frame: Omit<IssuedServerComponent, keyof ExactServerFrame | 'disposed'>
): IssuedServerComponent {
	const issued: IssuedServerComponent = {
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
			if (frame.scheduled && !issued.deferredScheduledDisposal)
				await frame.scheduled[Symbol.asyncDispose]();
			else if (frame.synchronous?.lifetime)
				await disposeDirectSsrLifetime(frame.synchronous.lifetime, 'ssr render complete');
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
				const frame = candidate as IssuedServerComponent;
				assertArtifact(artifact, frame.artifact);
				if (frame.disposed) throw new Error('Cannot write a disposed server component frame');
				output = await (frame.kind === 'scheduled'
					? writeScheduledFrame(execution, frame)
					: writeSynchronousFrame(execution, frame));
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
	frame: IssuedServerComponent
): Promise<string> {
	const scheduled = frame.scheduled!;
	for (let pass = 0; pass < execution.context.maxTaskPasses; pass++) {
		const renderCheckpoint = execution.context.onComponentAttemptCheckpoint?.();
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
				execution.context.onComponentAttemptRollback?.(renderCheckpoint);
				restoreTargetReceiptLayers(execution.context, targetCheckpoint);
				continue;
			}
			return publishFrame(execution, frame, html, scheduled.snapshot);
		} catch (error) {
			primary = error;
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

async function writeSynchronousFrame<Publication>(
	execution: ServerArtifactExecution<Publication>,
	frame: IssuedServerComponent
): Promise<string> {
	const direct = frame.synchronous!;
	frame.preparation = direct.preparation;
	let primary: unknown = noPrimaryFailure;
	try {
		const html = await renderOperationEnhancementsAsync(
			execution.context,
			frame.reference.enhancement,
			() =>
				renderDirectSsrContent(
					execution.context,
					direct.content,
					direct.owner,
					execution.renderChildren,
					execution.renderOwnedComponent
				),
			direct.owner,
			execution.options,
			(_context, children, parent) => execution.renderChildren(children, parent)
		);
		return publishFrame(execution, frame, html, direct.snapshot);
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		await disposeFramePreparation(frame, primary);
	}
}

function publishFrame<Publication>(
	execution: ServerArtifactExecution<Publication>,
	frame: IssuedServerComponent,
	html: string,
	snapshot: DirectSsrComponentResult['snapshot']
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
	execution.context.onDirectComponentRendered?.(snapshot);
	return output;
}

async function disposeFramePreparation(
	frame: IssuedServerComponent,
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
