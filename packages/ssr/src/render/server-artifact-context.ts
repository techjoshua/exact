import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import type { DirectSsrComponentPublisher } from './direct-component-contracts.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { RenderValue } from './execution.js';
import type { ServerComponentReference } from './server-component-reference.js';
import type { SsrProgramRenderTarget } from './program-writer-output.js';

/** Request-owned rendering and publication capabilities shared by synchronous and scheduled artifacts. */
export type ServerArtifactExecution<Publication> = Readonly<{
	/** Optional owner-specific preparation; ordinary component output has no projection record. */
	prepareOutput?: (
		content: import('./direct-component-content.js').DirectSsrComponentContent,
		owner: AnyComponentInstance | undefined
	) => import('./direct-component-content.js').DirectSsrComponentContent;
	context: SsrContext;
	options: SsrRenderOptions;
	publication: Publication;
	publish: DirectSsrComponentPublisher<Publication>;
	/** Invoke on this execution so shared forwarding retains the request's context and options. */
	renderChildren(
		this: ServerArtifactExecution<Publication>,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined
	): RenderValue<string>;
	/** Invoke on this execution; each descendant creates its own execution and render owner. */
	renderOwnedComponent(
		this: ServerArtifactExecution<Publication>,
		component: ServerComponentReference,
		parent: AnyComponentInstance | undefined
	): RenderValue<string>;
}> &
	SsrProgramRenderTarget<unknown> & {
		/** Selected component owner, bound before content traversal and retained across suspension. */
		renderOwner: AnyComponentInstance | undefined;
	};
