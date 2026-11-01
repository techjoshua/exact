import { verifyReactServerCancellation } from './react-server-cancellation-journey.js';
import { verifyReactChildrenSemantics } from './react-children-semantics-journey.js';
import type { ReactNode } from '@exactjs/react-compat';
type ChildArrayApi = Pick<
	typeof import('@exactjs/react-compat'),
	'Children' | 'createElement' | 'Component' | 'Fragment'
> &
	Pick<typeof import('@exactjs/react-compat/exact'), 'toReactNode'>;
type ServerArrayApi = ChildArrayApi &
	Pick<typeof import('@exactjs/react-compat'), 'lazy' | 'Suspense'> &
	Pick<
		typeof import('@exactjs/react-dom-compat/server'),
		'renderToString' | 'renderToStaticMarkup' | 'renderToReadableStream'
	>;
type ClientArrayApi = ChildArrayApi &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot' | 'hydrateRoot'>;
function check(value: boolean, message: string): void {
	if (!value) throw new Error('React child arrays: ' + message);
}
function nested(value: ReactNode): ReactNode {
	for (let depth = 0; depth < 20_000; depth++) value = [value];
	return value;
}

/** Checks deep arrays, sparse mapping, species and getter order through public children and projection APIs. */
export function verifyReactChildArrayValues(api: ChildArrayApi): void {
	verifyReactChildrenSemantics(api);

	const value = nested('safe');
	check(
		api.Children.toArray(value).join('') === 'safe' && api.Children.count(value) === 1,
		'deep traversal'
	);
	const projected = api.toReactNode(value);
	check(api.Children.toArray(projected).join('') === 'safe', 'deep projection');
	const sparse: ReactNode[] = Array(3);
	sparse[2] = 'tail';
	const mapped = api.toReactNode(sparse) as ReactNode[];
	check(
		mapped.length === 3 &&
			!Object.hasOwn(mapped, 0) &&
			!Object.hasOwn(mapped, 1) &&
			mapped[2] === 'tail',
		'sparse cells stay holes'
	);
	const shared = ['shared'];
	const siblings = api.toReactNode([shared, shared]) as ReactNode[][];
	check(
		siblings[0] !== siblings[1] && siblings[0]?.[0] === 'shared' && siblings[1]?.[0] === 'shared',
		'shared siblings project independently'
	);
	let speciesCalls = 0;
	class Target extends Array<ReactNode> {
		constructor(length: number) {
			super(length);
			speciesCalls++;
		}
	}
	const species = ['value'];
	Object.defineProperty(species, 'constructor', { value: { [Symbol.species]: Target } });
	const target = api.toReactNode(species);
	check(
		target instanceof Target && target[0] === 'value' && speciesCalls === 1,
		'species constructor retained'
	);
	const order: string[] = [];
	const parent: ReactNode[] = [[], 'before'];
	Object.defineProperty(parent[0]!, 0, {
		configurable: true,
		get() {
			order.push('child');
			parent[1] = 'after';
			return 'nested';
		}
	});
	Object.defineProperty(parent, 1, {
		configurable: true,
		get() {
			order.push('parent');
			return 'after';
		},
		set() {}
	});
	const ordered = api.toReactNode(parent) as ReactNode[];
	check(
		order.join(',') === 'child,parent' &&
			(ordered[0] as ReactNode[])?.[0] === 'nested' &&
			ordered[1] === 'after',
		'nested getter order retained'
	);
	const cycle: ReactNode[] = [];
	cycle.push(cycle);
	for (const operation of [() => api.Children.toArray(cycle), () => api.toReactNode(cycle)]) {
		let failure: unknown;
		try {
			operation();
		} catch (error) {
			failure = error;
		}
		check(failure instanceof TypeError, 'cycles reject');
	}
	let mapCalls = 0;
	const custom = ['value'];
	Object.defineProperty(custom, 'map', {
		value(callback: (node: ReactNode) => ReactNode) {
			mapCalls++;
			return [callback('override')];
		}
	});
	check(
		(api.toReactNode(custom) as ReactNode[])[0] === 'override' && mapCalls === 1,
		'authored map override retained'
	);
	const closes: string[] = [];
	const inner: ReactNode[] = [];
	Object.defineProperty(inner, Symbol.iterator, {
		value: () => ({
			next: () => ({ done: false, value: inner }),
			return() {
				closes.push('inner');
				throw 0;
			}
		})
	});
	const outer: ReactNode[] = [];
	let selected = false;
	Object.defineProperty(outer, Symbol.iterator, {
		value: () => ({
			next: () => (selected ? { done: true } : { done: false, value: ((selected = true), inner) }),
			return() {
				closes.push('outer');
				return { done: true };
			}
		})
	});
	let failure: unknown;
	try {
		api.Children.toArray(outer);
	} catch (error) {
		failure = error;
	}
	check(
		failure instanceof TypeError && closes.join(',') === 'inner,outer',
		'iterator cleanup preserves initiating failure and closes ancestors'
	);
}

/** Checks synchronous, static and all-ready server serialization shares the client's nested text boundaries. */
export async function verifyReactChildArrayServer(api: ServerArrayApi): Promise<string> {
	verifyReactChildArrayValues(api);
	await verifyReactServerCancellation(api);
	check(api.renderToString(nested('safe')) === 'safe', 'deep SSR traversal');
	const tree: ReactNode = ['a', ['b'], null, false, '', 'c'];
	const html = api.renderToString(tree);
	check(html === 'a<!-- -->b<!-- -->c', 'nested and empty text boundaries');
	check(api.renderToStaticMarkup(tree) === 'abc', 'static output has no hydration separators');
	for (const empty of ['', api.createElement(api.Fragment), api.createElement(() => null)]) {
		check(
			api.renderToString(['a', empty, 'b']) === 'a<!-- -->b',
			'empty output preserves adjoining text boundaries'
		);
		const stream = await api.renderToReadableStream(['a', empty, 'b']);
		check(
			(await new Response(stream).text()) === 'a<!-- -->b',
			'empty all-ready output preserves boundaries'
		);
	}

	const stream = await api.renderToReadableStream(tree);
	check((await new Response(stream).text()) === html, 'all-ready output agrees');
	return html;
}

/** Checks nested key scopes, empty-slot identity, following work and hydrated text ownership through public roots. */
export function verifyReactChildArrayClient(
	api: ClientArrayApi,
	document: Document,
	html: string
): void {
	verifyReactChildArrayValues(api);
	const container = document.createElement('div');
	const reports: unknown[] = [];
	const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
	let releases = 0;
	const ref = (node: Element | null) => {
		if (node)
			return () => {
				releases++;
			};
	};
	const tree = (first: string, second: string): ReactNode => [
		[api.createElement('button', { key: 'same', ref }, first)],
		[api.createElement('button', { key: 'same', ref }, second)]
	];
	try {
		root.render(nested('safe'));
		check(container.textContent === 'safe', 'deep client traversal');
		root.render(
			api.createElement(({ children }: { children?: ReactNode }) => children, null, nested('safe'))
		);
		check(container.textContent === 'safe', 'deep function props projection');
		class Wrapper extends api.Component<{ children?: ReactNode }> {
			render() {
				return this.props.children;
			}
		}
		root.render(api.createElement(Wrapper, null, nested('safe')));
		check(container.textContent === 'safe', 'deep class props projection');
		root.render(tree('first', 'second'));
		const nodes = [...container.querySelectorAll('button')];
		root.render(tree('updated first', 'updated second'));
		check(
			container.querySelectorAll('button').length === 2 &&
				[...container.querySelectorAll('button')].every((node, index) => node === nodes[index]),
			'independent nested key scopes retain DOM'
		);
		check(
			nodes.map((node) => node.textContent).join(',') === 'updated first,updated second',
			'both retained groups update'
		);
		root.render([[api.createElement('button', { key: 'same', ref }, 'following')], []]);
		check(
			container.querySelector('button') === nodes[0] && releases === 1,
			'removal retires only its group'
		);
		root.render([null, api.createElement('input', { defaultValue: 'retained' })]);
		const input = container.querySelector('input')!;
		input.value = 'edited';
		root.render([
			api.createElement('input', { defaultValue: 'new' }),
			api.createElement('input', { defaultValue: 'retained' })
		]);
		check(
			container.querySelectorAll('input')[1] === input && input.value === 'edited',
			'empty slots preserve following identity'
		);
		root.unmount();
		check(
			releases === 2 && reports.length === 0 && container.childNodes.length === 0,
			'cleanup and unexpected reports'
		);
	} finally {
		root.unmount();
	}
	const hydrated = document.createElement('div');
	hydrated.innerHTML = html;
	const text = [...hydrated.childNodes].filter((node) => node.nodeType === 3);
	const hydratedRoot = api.hydrateRoot(hydrated, ['a', ['b'], null, false, '', 'c'], {
		onUncaughtError: (error) => reports.push(error)
	});
	try {
		check(
			text.length === 3 && text.every((node) => node.parentNode === hydrated),
			'SSR text nodes are adopted'
		);
		hydratedRoot.render(['updated', ['b'], null, false, '', 'c']);
		check(
			text[0]?.nodeValue === 'updated' && text.every((node) => node.parentNode === hydrated),
			'hydrated text retains identity on update'
		);
	} finally {
		hydratedRoot.unmount();
	}
	check(hydrated.childNodes.length === 0 && reports.length === 0, 'hydration cleanup');
}
