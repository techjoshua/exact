import type { CorpusScenario } from './contracts.js';

/** Normative scenario catalog. Expectations live in tests and are not inferred from compiler output. */
export const corpusScenarios = [
	{
		id: 'static-and-forwarded-content',
		description: 'Static structure, compact components, direct children, and prop forwarding.',
		fixture: 'fundamentals.fixtures.tsx',
		compilerPaths: [
			'compiled-target-artifact',
			'static-render-program',
			'compact-render-abi',
			'direct-child-artifact',
			'bounded-component-range-claim',
			'direct-server-child-issuance',
			'props-only-forwarding',
			'sync-direct-ssr',
			'sync-direct-server-executor',
			'stateless-server-leaf-executor',
			'compiler-proven-output-bytes',
			'hydration-static-claims'
		],
		modes: ['client-mount', 'client-update', 'ssr-sync', 'ssr-async', 'ssr-stream', 'hydrate-match']
	},
	{
		id: 'indexed-state-and-properties',
		description: 'Text and property bindings update from durable state without replacing DOM.',
		fixture: 'state.fixtures.tsx',
		compilerPaths: [
			'direct-text-binding',
			'adjacent-text-projection',
			'static-native-attribute',
			'arbitrary-expression-fallback',
			'mixed-reader-dispatch',
			'direct-property-binding',
			'indexed-property-operand',
			'indexed-state-alias-read',
			'state-only-update-mask',
			'mixed-prop-state-update',
			'indexed-input-update-plan',
			'nested-indexed-input-update-plan',
			'nested-property-prop-operand',
			'snapshot-resumption-input',
			'component-positional-root-publication',
			'compiler-selected-ssr-attributes',
			'compiler-static-root-identity',
			'compiler-fused-root-opening',
			'direct-server-value-propagation',
			'durable-component-abi'
		],
		modes: ['client-mount', 'client-update', 'ssr-sync', 'hydrate-match']
	},
	{
		id: 'conditional-range-and-recovery',
		description: 'Conditional component ranges update and recover at their compiler-owned root.',
		fixture: 'structure.fixtures.tsx',
		compilerPaths: ['conditional-structural-range', 'hydration-recovery'],
		modes: ['client-mount', 'client-update', 'ssr-sync', 'hydrate-match', 'hydrate-recover']
	},
	{
		id: 'keyed-context-ref-lifecycle',
		description: 'Keyed identity composes with context, refs, and owner cleanup.',
		fixture: 'capabilities.fixtures.tsx',
		compilerPaths: [
			'artifact-local-instance-construction',
			'keyed-list-reconciliation',
			'direct-property-prop-operand',
			'context-capability',
			'ref-capability',
			'lifecycle-capability',
			'durable-component-abi'
		],
		modes: ['client-mount', 'client-update', 'client-unmount', 'ssr-sync', 'hydrate-match']
	},
	{
		id: 'finite-registry-forward-reference',
		description: 'An eager finite registry references declarations authored later in the module.',
		fixture: 'registry.fixtures.tsx',
		compilerPaths: [
			'eager-registry-artifact',
			'lazy-registry-facade',
			'hoisted-artifact-attachment'
		],
		modes: ['client-mount', 'ssr-sync', 'ssr-async', 'hydrate-match']
	},
	{
		id: 'lexical-component-diagnostic',
		description: 'A local component cannot receive one stable target-local artifact.',
		fixture: 'test-support/diagnostics/lexical-component.tsx',
		compilerPaths: ['lexical-micro-component'],
		modes: []
	},
	{
		id: 'intrinsic-and-component-enhancements',
		description: 'One enhancement targets both an intrinsic and a native component boundary.',
		fixture: 'enhancements.fixtures.tsx',
		compilerPaths: ['intrinsic-enhancement-target', 'component-enhancement-target'],
		modes: ['client-mount', 'ssr-sync', 'hydrate-match']
	},
	{
		id: 'async-component-task',
		description:
			'A compiler-defined task updates client state and settles during server rendering.',
		fixture: 'tasks.fixtures.tsx',
		compilerPaths: [
			'task-capability',
			'defined-function-task-reuse',
			'indexed-task-dependency-source',
			'async-task-ssr'
		],
		modes: ['client-mount', 'client-update', 'ssr-async', 'ssr-progressive']
	},
	{
		id: 'explicit-react-compatibility-boundary',
		description:
			'Compatibility ownership is tracked but excluded from native runtime expectations.',
		fixture: 'test-support/diagnostics/react-compatibility.tsx',
		compilerPaths: ['react-owned-component'],
		modes: []
	},
	{
		id: 'open-dynamic-component',
		description: 'An explicitly supplied native component activates from an inert server range.',
		fixture: 'dynamic.fixtures.tsx',
		compilerPaths: ['open-dynamic-component'],
		modes: ['client-mount', 'ssr-async', 'hydrate-match']
	},
	{
		id: 'native-legacy-path-exclusion',
		description: 'All native fixtures reject obsolete VNode and runtime-fallback architecture.',
		fixture: '*',
		compilerPaths: [
			'native-vnode',
			'runtime-created-native-artifact',
			'generic-native-ssr',
			'generic-native-binding-group'
		],
		modes: []
	}
] as const satisfies readonly CorpusScenario[];
