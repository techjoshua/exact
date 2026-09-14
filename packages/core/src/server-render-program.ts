import type { CompiledEnhancementNode } from './component/contracts.js';
import { currentComponentDomain } from './component/domain.js';
import type { ExactRenderProgramSsrInvocation } from './render-program.js';

const PreparedServerRenderProgram = Symbol.for('@exactjs/prepared-server-render-program');

/** Compiler-issued server invocation consumed directly by the compiler-closed SSR lane. */
export type ExactPreparedServerRenderProgram = ExactRenderProgramSsrInvocation &
	Readonly<{
		[PreparedServerRenderProgram]: true;
		/** Compiler-proven region whose reads are delayed until its task owner is ready. */
		deferredValues?: Readonly<{ host: object; read: () => readonly unknown[] }>;
		enhancement?: CompiledEnhancementNode;
		domain?: import('./component/contracts.js').ComponentDomain;
	}>;

/**
 * Captures compiler-known server slots while the enclosing component issuance scope is active.
 * Ordinary invocations retain eager sibling issuance. A compiler-proven deferred region instead
 * carries its task owner and a read that the SSR engine performs only after readiness. Neither
 * creation nor recognition evaluates that read. Client artifacts retain their own lazy readers.
 */
export function createPreparedServerRenderProgram(
	branded: ExactRenderProgramSsrInvocation['program'],
	eagerValues: readonly unknown[],
	enhancement?: CompiledEnhancementNode,
	deferredValues?: ExactPreparedServerRenderProgram['deferredValues']
): ExactPreparedServerRenderProgram {
	// The nominal wrapper prevents ordinary child normalization from flattening the values array.
	const domain = enhancement ? currentComponentDomain() : undefined;
	const invocation = {
		[PreparedServerRenderProgram]: true,
		program: branded,
		eagerValues
	} as {
		readonly [key: symbol]: unknown;
		program: ExactRenderProgramSsrInvocation['program'];
		eagerValues: readonly unknown[];
		deferredValues?: ExactPreparedServerRenderProgram['deferredValues'];
		enhancement?: CompiledEnhancementNode;
		domain?: import('./component/contracts.js').ComponentDomain;
	};
	if (enhancement) invocation.enhancement = enhancement;
	if (deferredValues) invocation.deferredValues = deferredValues;
	if (domain) invocation.domain = domain;
	return invocation as ExactPreparedServerRenderProgram;
}

/** Recognizes only the realm-stable compiler-issued direct server invocation shape. */
export function readPreparedServerRenderProgram(
	value: unknown
): ExactPreparedServerRenderProgram | undefined {
	return typeof value === 'object' && value !== null && PreparedServerRenderProgram in value
		? (value as ExactPreparedServerRenderProgram)
		: undefined;
}
