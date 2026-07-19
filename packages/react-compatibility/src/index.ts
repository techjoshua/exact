export type ReactBaseline = '18.3' | '19.2';
export type CapabilityStatus = 'planned' | 'supported' | 'approximate' | 'unsupported';
export type ReactCompatibilityModule =
	| 'react'
	| 'react/jsx-runtime'
	| 'react/jsx-dev-runtime'
	| 'react-dom'
	| 'react-dom/client'
	| 'react-dom/server'
	| 'react-dom/static'
	| 'react/compiler-runtime';

export type ReactCapability = Readonly<{
	module: ReactCompatibilityModule;
	name: string;
	phase: 1 | 2 | 3 | 4 | 5 | 6 | null;
	status: CapabilityStatus;
	baselines: readonly ReactBaseline[];
	note?: string;
}>;

const both = ['18.3', '19.2'] as const;
const react19 = ['19.2'] as const;

function supported(
	module: ReactCompatibilityModule,
	phase: 1 | 2 | 3 | 4 | 5 | 6,
	names: readonly string[],
	baselines: readonly ReactBaseline[] = both
): ReactCapability[] {
	return names.map((name) => ({ module, name, phase, status: 'supported', baselines }));
}

function approximate(
	module: ReactCompatibilityModule,
	phase: 1 | 2 | 3 | 4 | 5 | 6,
	names: readonly string[],
	note: string,
	baselines: readonly ReactBaseline[] = both
): ReactCapability[] {
	return names.map((name) => ({ module, name, phase, status: 'approximate', baselines, note }));
}

function unsupported(
	module: ReactCompatibilityModule,
	names: readonly string[],
	baselines: readonly ReactBaseline[] = both,
	note?: string
): ReactCapability[] {
	return names.map((name) => ({
		module,
		name,
		phase: null,
		status: 'unsupported',
		baselines,
		...(note ? { note } : {})
	}));
}

/** Machine-readable compatibility contract. Runtime exports are verified against this inventory. */
export const reactCapabilities: readonly ReactCapability[] = Object.freeze([
	...supported('react', 1, [
		'Children',
		'Fragment',
		'cloneElement',
		'createElement',
		'isValidElement',
		'useCallback',
		'useDebugValue',
		'useMemo',
		'useReducer',
		'useRef',
		'useState',
		'version'
	]),
	...supported('react', 2, [
		'createContext',
		'createRef',
		'forwardRef',
		'memo',
		'useContext',
		'useImperativeHandle'
	]),
	...approximate(
		'react',
		2,
		['StrictMode'],
		'Structural wrapper only; development double-invocation checks are not reproduced'
	),
	...approximate(
		'react',
		2,
		['useEffect', 'useInsertionEffect', 'useLayoutEffect'],
		'Dependency and cleanup semantics match; update commit timing uses post-DOM microtasks'
	),
	...approximate(
		'react',
		6,
		['useId'],
		"Stable and unique per root with identifierPrefix hydration identity, without React's exact identifier encoding or streaming allocation"
	),
	...approximate(
		'react',
		2,
		['useSyncExternalStore'],
		'Subscription and snapshot behavior without concurrent tearing checks'
	),
	...supported('react', 3, ['lazy']),
	...approximate(
		'react',
		3,
		['Suspense'],
		'Thrown-promise fallback and retry semantics with all-ready server streams, without concurrent reveal ordering'
	),
	...approximate(
		'react',
		3,
		['startTransition', 'useTransition'],
		"Transition actions and pending state without React's concurrent priority lanes"
	),
	...approximate(
		'react',
		3,
		['useDeferredValue'],
		'Values defer through a microtask rather than concurrent rendering lanes'
	),
	...supported('react', 4, ['PureComponent']),
	...approximate(
		'react',
		4,
		['Component'],
		"State, refs, context, error boundaries, and lifecycle ordering are supported; commit callbacks use eXact's post-DOM microtask boundary"
	),
	...approximate(
		'react',
		4,
		['Profiler'],
		'Reports mount/update phases and adapter render duration without Fiber subtree/base duration accounting'
	),
	...approximate(
		'react',
		4,
		['act'],
		"Flushes eXact scheduling and promise microtasks without React's internal test queue"
	),
	...approximate(
		'react',
		4,
		['unstable_act'],
		"Alias of compatibility act without React's internal test queue",
		['18.3']
	),
	...supported('react', 3, ['use'], react19),
	...approximate(
		'react',
		3,
		['Activity'],
		'Visible and hidden structural behavior without activity lifecycle preservation',
		react19
	),
	...approximate(
		'react',
		5,
		['cache'],
		'Request-scoped during compatibility server component rendering; calls outside a server render use a process fallback',
		react19
	),
	...approximate(
		'react',
		5,
		['cacheSignal'],
		'Aborts with the compatibility server request; calls outside a server render use a stable fallback signal',
		react19
	),
	...approximate(
		'react',
		3,
		['captureOwnerStack'],
		'Returns the bounded eXact React-owner ancestry without Fiber source locations',
		react19
	),
	...approximate(
		'react',
		3,
		['useActionState'],
		'Async action state and pending tracking without React form transition coordination',
		react19
	),
	...approximate(
		'react',
		3,
		['useOptimistic'],
		'Optimistic reduction resets when passthrough state changes without lane-based rollback',
		react19
	),
	...supported('react', 2, ['useEffectEvent'], react19),
	...unsupported('react', ['ViewTransition', 'addTransitionType'], react19, 'Canary-only API'),
	...unsupported('react', ['unstable_useCacheRefresh'], react19, 'Unstable cache API'),
	...unsupported('react', ['createFactory'], both, 'Deprecated legacy factory API'),

	...supported('react/jsx-runtime', 1, ['Fragment', 'jsx', 'jsxs']),
	...supported('react/jsx-dev-runtime', 1, ['Fragment', 'jsxDEV']),

	...supported('react-dom', 2, ['flushSync', 'unstable_batchedUpdates', 'version']),
	...supported('react-dom', 3, ['createPortal']),
	...supported('react-dom', 3, ['requestFormReset'], react19),
	...approximate(
		'react-dom',
		6,
		['preconnect', 'prefetchDNS', 'preinit', 'preinitModule', 'preload', 'preloadModule'],
		"Deduplicated client hints and priority-ordered server coordination without React's internal resource graph",
		react19
	),
	...approximate(
		'react-dom',
		3,
		['useFormState'],
		'Alias of compatibility useActionState without native form transition coordination',
		react19
	),
	...approximate(
		'react-dom',
		3,
		['useFormStatus'],
		'Stable non-pending status outside unsupported native form action coordination',
		react19
	),
	...supported('react-dom', 4, ['createRoot', 'render', 'unmountComponentAtNode'], ['18.3']),
	...approximate(
		'react-dom',
		5,
		['hydrate'],
		"Deprecated hydration adopts matching markerless DOM without React's selective hydration scheduler",
		['18.3']
	),
	...approximate(
		'react-dom',
		5,
		['hydrateRoot'],
		'Main-entrypoint bridge to markerless compatibility hydration without selective hydration',
		['18.3']
	),
	...supported('react-dom', 4, ['findDOMNode'], ['18.3']),
	...unsupported(
		'react-dom',
		['unstable_renderSubtreeIntoContainer'],
		['18.3'],
		'Deprecated subtree rendering is not supported'
	),

	...supported('react-dom/client', 1, ['createRoot', 'version']),
	...approximate(
		'react-dom/client',
		6,
		['hydrateRoot'],
		'Adopts matching markerless DOM, preserves uniquely identified dirty form state on replacement, and reports recoverable mismatches without selective hydration or Fiber error stacks'
	),

	...approximate(
		'react-dom/server',
		6,
		['renderToString', 'renderToStaticMarkup'],
		"Target-specific common HTML, SVG, form, style, custom-element, image-preload, and resource normalization without React's complete host config"
	),
	...approximate(
		'react-dom/server',
		6,
		['renderToPipeableStream'],
		'Abortable Node stream contract that waits for Suspense resources rather than incrementally revealing boundaries'
	),
	...approximate(
		'react-dom/server',
		6,
		['renderToReadableStream'],
		'Abortable Web stream contract that waits for Suspense resources rather than incrementally revealing boundaries'
	),
	...supported('react-dom/server', 5, ['version']),
	...approximate(
		'react-dom/server',
		5,
		['renderToNodeStream', 'renderToStaticNodeStream'],
		'Deprecated Node streams emit an all-ready render',
		['18.3']
	),
	...approximate(
		'react-dom/server',
		5,
		['resume', 'resumeToPipeableStream'],
		'Rerenders the supplied tree because serialized postponed Fiber state is not available',
		react19
	),
	...approximate(
		'react-dom/static',
		5,
		['prerender', 'prerenderToNodeStream'],
		'Produces all-ready preludes with no postponed state',
		react19
	),
	...approximate(
		'react-dom/static',
		5,
		['resumeAndPrerender', 'resumeAndPrerenderToNodeStream'],
		'Rerenders to an all-ready prelude instead of resuming postponed Fiber state',
		react19
	),
	...supported('react-dom/static', 5, ['version'], react19),

	...supported('react/compiler-runtime', 3, ['c'], react19),

	...approximate(
		'react',
		6,
		['__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'],
		'React 18 dispatcher, batch, owner, and act shapes required by genuine reconcilers',
		['18.3']
	),
	...approximate(
		'react',
		6,
		[
			'__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE',
			'__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'
		],
		'React 19 client/server dispatcher, transition, act, and stack fields required by genuine reconcilers',
		['19.2']
	),
	...unsupported(
		'react',
		['__COMPILER_RUNTIME'],
		both,
		'Private compiler marker; use react/compiler-runtime'
	),
	...unsupported(
		'react-dom',
		[
			'__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE',
			'__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'
		],
		both,
		'Private React DOM internals'
	)
]);

export type RendererCompatibilityCapability = Readonly<{
	name:
		| 'shared-internals'
		| 'external-dispatchers'
		| 'generic-react-reconciler'
		| 'bounded-owner-context-frame'
		| 'renderer-certification';
	status: CapabilityStatus;
	baselines: readonly ReactBaseline[];
	note: string;
}>;

export const rendererCompatibilityCapabilities: readonly RendererCompatibilityCapability[] =
	Object.freeze([
		{
			name: 'shared-internals',
			status: 'supported',
			baselines: both,
			note: 'One target-specific singleton is shared by eXact adapters and genuine reconcilers'
		},
		{
			name: 'external-dispatchers',
			status: 'supported',
			baselines: both,
			note: 'Public hooks route to the currently installed eXact or external dispatcher and restore in finally'
		},
		{
			name: 'generic-react-reconciler',
			status: 'supported',
			baselines: both,
			note: 'Pinned mutation renderers pass for reconciler 0.29.2 and 0.33.0'
		},
		{
			name: 'bounded-owner-context-frame',
			status: 'approximate',
			baselines: both,
			note: 'Ancestry and hook memo state support context bridges without lanes, flags, alternates, or update queues'
		},
		{
			name: 'renderer-certification',
			status: 'planned',
			baselines: ['19.2'],
			note: 'R3F 9.6.1 and the pinned Drei subset are compatible candidates; certification remains gated by the scenarios listed in the manifest'
		}
	]);

export type ConformanceTrace = Readonly<{
	baseline: ReactBaseline;
	version: string;
	exports: Readonly<Record<string, readonly string[]>>;
	element: Readonly<{ type: string; key: string | null; children: readonly string[] }>;
	serverHtml: string;
	client: Readonly<{
		initialHtml: string;
		updatedHtml: string;
		renders: number;
		events: readonly string[];
	}>;
}>;

export type TraceDifference = Readonly<{ path: string; expected: unknown; actual: unknown }>;

/** Compares observable scenario output while allowing version/export inventories to differ by baseline. */
export function compareConformanceTraces(
	expected: ConformanceTrace,
	actual: ConformanceTrace
): readonly TraceDifference[] {
	const differences: TraceDifference[] = [];
	compareValue('element', expected.element, actual.element, differences);
	compareValue('serverHtml', expected.serverHtml, actual.serverHtml, differences);
	compareValue('client', expected.client, actual.client, differences);
	return differences;
}

export function capabilityFor(
	module: ReactCompatibilityModule,
	name: string,
	baseline: ReactBaseline
): ReactCapability | undefined {
	return reactCapabilities.find(
		(capability) =>
			capability.module === module &&
			capability.name === name &&
			capability.baselines.includes(baseline)
	);
}

function compareValue(
	path: string,
	expected: unknown,
	actual: unknown,
	differences: TraceDifference[]
): void {
	if (Object.is(expected, actual)) return;
	if (Array.isArray(expected) && Array.isArray(actual)) {
		if (expected.length !== actual.length)
			differences.push({
				path: `${path}.length`,
				expected: expected.length,
				actual: actual.length
			});
		for (let index = 0; index < Math.min(expected.length, actual.length); index++) {
			compareValue(`${path}[${index}]`, expected[index], actual[index], differences);
		}
		return;
	}
	if (isRecord(expected) && isRecord(actual)) {
		const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
		for (const key of [...keys].sort())
			compareValue(`${path}.${key}`, expected[key], actual[key], differences);
		return;
	}
	differences.push({ path, expected, actual });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
