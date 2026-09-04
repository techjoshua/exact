import type { CompilerPath, CorpusMode } from './contracts.js';

const universalRenderModes = [
	'client-mount',
	'ssr-sync',
	'ssr-async',
	'ssr-stream',
	'hydrate-match'
] as const satisfies readonly CorpusMode[];

/** Complete compiler-path inventory that every corpus revision must cover intentionally. */
export const compilerPathInventory = [
	path(
		'compiled-target-artifact',
		'specialized',
		'Client and server artifacts are compiler-issued.',
		universalRenderModes
	),
	path(
		'static-render-program',
		'specialized',
		'Static intrinsic structure is emitted as a render program.',
		universalRenderModes
	),
	path(
		'direct-text-binding',
		'specialized',
		'Reactive scalar text updates without component re-execution.',
		['client-update', 'hydrate-match']
	),
	path(
		'adjacent-text-projection',
		'specialized',
		'One scalar and its adjacent authored text share one compiler-owned text operation.',
		['client-update', 'ssr-sync', 'hydrate-match']
	),
	path(
		'static-native-attribute',
		'specialized',
		'Compiler-proven native numeric and boolean constants remain static across targets.',
		['client-mount', 'ssr-sync', 'hydrate-match']
	),
	path(
		'arbitrary-expression-fallback',
		'supported-general',
		'Arbitrary authored expressions retain executable readers and their computation owners.',
		['client-mount', 'hydrate-match']
	),
	path(
		'mixed-reader-dispatch',
		'specialized',
		'Statement-bodied slots share one component-local reader dispatcher.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'direct-property-binding',
		'specialized',
		'Reactive DOM properties update at their owning intrinsic.',
		['client-update', 'hydrate-match']
	),
	path(
		'indexed-property-operand',
		'specialized',
		'Exact indexed state and prop reads execute from immutable intrinsic operand tuples.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'indexed-state-alias-read',
		'specialized',
		'Checker-proven whole-state aliases retain indexed dependency identity inside authored expressions.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'state-only-update-mask',
		'specialized',
		'State dependencies select only affected update operations.',
		['client-update']
	),
	path(
		'props-only-forwarding',
		'specialized',
		'Parent props flow directly into child and intrinsic operations.',
		['client-mount', 'ssr-sync', 'hydrate-match']
	),
	path(
		'direct-property-prop-operand',
		'specialized',
		'A direct property of a keyed item crosses a native component boundary as an indexed operand.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'nested-property-prop-operand',
		'specialized',
		'A direct property of an object-valued indexed prop crosses a native boundary without a computation owner.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'mixed-prop-state-update',
		'specialized',
		'Prop and state dependencies remain distinct in one component.',
		['client-update', 'hydrate-match']
	),
	path(
		'indexed-input-update-plan',
		'specialized',
		'Exact top-level prop relationships apply through a receiver-owned indexed update plan.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'nested-indexed-input-update-plan',
		'specialized',
		'Exact nested prop projections reevaluate from their indexed root prop receipt.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'snapshot-resumption-input',
		'specialized',
		'Exact inputs and primitive defaults omit redundant state or the complete reconstructible resumption contract.',
		['ssr-sync', 'hydrate-match']
	),
	path(
		'component-positional-root-publication',
		'specialized',
		'Finite nested root props publish positionally against the target-local component schema.',
		['ssr-sync', 'hydrate-match']
	),
	path(
		'conditional-structural-range',
		'supported-general',
		'Conditional children retain a bounded structural range.',
		['client-update', 'ssr-sync', 'hydrate-match', 'hydrate-recover']
	),
	path(
		'keyed-list-reconciliation',
		'specialized',
		'Keyed collections preserve identity while moving entries.',
		['client-update', 'ssr-sync', 'hydrate-match']
	),
	path(
		'context-capability',
		'specialized',
		'Context providers and consumers use durable component ownership.',
		['client-mount', 'ssr-sync', 'hydrate-match']
	),
	path('ref-capability', 'specialized', 'Refs resolve against mounted or adopted nodes.', [
		'client-mount',
		'hydrate-match'
	]),
	path(
		'lifecycle-capability',
		'specialized',
		'Unmount callbacks run exactly once with owner disposal.',
		['client-unmount']
	),
	path('task-capability', 'specialized', 'Compiler-defined tasks update their durable owner.', [
		'client-update',
		'ssr-async',
		'ssr-progressive'
	]),
	path(
		'defined-function-task-reuse',
		'specialized',
		'Setup and interaction calls share one durable function-task definition.',
		['client-mount', 'client-update']
	),
	path(
		'indexed-task-dependency-source',
		'specialized',
		'Compiler-proven task inputs subscribe to their exact indexed state or prop slot.',
		['client-mount', 'client-update']
	),
	path(
		'compact-render-abi',
		'specialized',
		'Components without durable capabilities use the compact ABI.',
		['client-mount', 'ssr-sync']
	),
	path(
		'artifact-local-instance-construction',
		'specialized',
		'Client artifacts directly select their immutable capability-specific instance constructor.',
		['client-mount', 'client-update', 'hydrate-match']
	),
	path(
		'durable-component-abi',
		'specialized',
		'Stateful and capability-owning components use durable instances.',
		['client-update', 'client-unmount', 'hydrate-match']
	),
	path(
		'direct-child-artifact',
		'specialized',
		'Native child components cross a target-local artifact edge.',
		universalRenderModes
	),
	path(
		'bounded-component-range-claim',
		'specialized',
		'A compiler-known following intrinsic bounds an opaque native child range without serialized delimiters.',
		['client-mount', 'client-update', 'ssr-sync', 'hydrate-match']
	),
	path(
		'direct-server-child-issuance',
		'specialized',
		'Compiler-proven server child slots issue the selected artifact without a prepared reference.',
		['ssr-sync']
	),
	path(
		'eager-registry-artifact',
		'specialized',
		'Finite eager registries retain compiler-owned identities.',
		['client-mount', 'ssr-sync', 'hydrate-match']
	),
	path(
		'lazy-registry-facade',
		'supported-general',
		'Finite lazy registry entries preserve registry identity.',
		['client-mount', 'ssr-async', 'hydrate-match']
	),
	path(
		'hoisted-artifact-attachment',
		'specialized',
		'Declarations receive artifacts before earlier executable references.',
		['client-mount', 'ssr-sync']
	),
	path(
		'lexical-micro-component',
		'diagnostic',
		'Lexical component declarations are rejected because they cannot own stable target artifacts.',
		[]
	),
	path(
		'intrinsic-enhancement-target',
		'specialized',
		'Enhancements compose directly with an intrinsic target.',
		['client-mount', 'ssr-sync', 'hydrate-match']
	),
	path(
		'component-enhancement-target',
		'specialized',
		'Enhancements compose across a native child component artifact.',
		['client-mount', 'ssr-sync', 'hydrate-match']
	),
	path(
		'sync-direct-ssr',
		'specialized',
		'Synchronous server artifacts render without a generic component renderer.',
		['ssr-sync']
	),
	path(
		'sync-direct-server-executor',
		'specialized',
		'Compiler-closed synchronous roots execute their server program without a returned render closure.',
		['ssr-sync']
	),
	path(
		'stateless-server-leaf-executor',
		'specialized',
		'Capability-free server leaves execute their compiled program without a request-local component frame.',
		['ssr-sync']
	),
	path(
		'compiler-proven-output-bytes',
		'specialized',
		'Synchronous server programs carry exact UTF-8 byte facts for compiler-owned spans.',
		['ssr-sync']
	),
	path(
		'compiler-selected-ssr-attributes',
		'specialized',
		'Compiler-known native attributes and conditional classes execute through component-local behavior plans.',
		['ssr-sync']
	),
	path(
		'compiler-static-root-identity',
		'specialized',
		'Compiler-created intrinsic identity is immutable SSR data outside the dynamic attribute plan.',
		['ssr-sync']
	),
	path(
		'compiler-fused-root-opening',
		'specialized',
		'Compiler-known root prefix, attributes, and following static markup publish as one operation.',
		['ssr-sync']
	),
	path(
		'direct-server-value-propagation',
		'specialized',
		'Exact synchronous server relationships inline direct assignments while authored calculations remain executable.',
		['ssr-sync']
	),
	path(
		'async-task-ssr',
		'supported-general',
		'Async task settlement is represented by async/progressive SSR.',
		['ssr-async', 'ssr-progressive']
	),
	path(
		'hydration-static-claims',
		'specialized',
		'Hydration adopts compiler-declared static DOM claims.',
		['hydrate-match']
	),
	path(
		'hydration-recovery',
		'supported-general',
		'A structural mismatch recovers at its compiler-owned component root.',
		['hydrate-recover']
	),
	path(
		'react-owned-component',
		'explicit-compatibility',
		'React-owned values cross only the explicit compatibility boundary.',
		[]
	),
	path(
		'open-dynamic-component',
		'supported-general',
		'An explicitly supplied native component activates from an inert server range.',
		['client-mount', 'ssr-async', 'hydrate-match']
	),
	path(
		'native-vnode',
		'forbidden-legacy',
		'Native component artifacts never construct virtual nodes.',
		[]
	),
	path(
		'runtime-created-native-artifact',
		'forbidden-legacy',
		'Native artifacts are compiler products, never runtime fallbacks.',
		[]
	),
	path(
		'generic-native-ssr',
		'forbidden-legacy',
		'Native SSR does not fall back to generic component execution.',
		[]
	),
	path(
		'generic-native-binding-group',
		'forbidden-legacy',
		'Native reactive bindings remain compiler-indexed.',
		[]
	)
] as const satisfies readonly CompilerPath[];

function path(
	id: string,
	classification: CompilerPath['classification'],
	description: string,
	requiredModes: readonly CorpusMode[]
): CompilerPath {
	return { id, classification, description, requiredModes };
}
