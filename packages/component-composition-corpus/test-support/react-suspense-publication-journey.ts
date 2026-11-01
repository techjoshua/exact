type SuspensePublicationApi = Pick<
	typeof import('@exactjs/react-compat'),
	'act' | 'createElement' | 'useState' | 'useTransition' | 'Suspense' | 'lazy'
> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

/** Checks accepted and suspended transition candidates retain resource ownership when prior content cleanup throws. */
export async function verifyReactSuspensePublication(
	api: SuspensePublicationApi,
	document: Document
): Promise<void> {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('React Suspense publication: ' + message);
	};
	for (const suspended of [false, true])
		for (const fails of [false, true]) {
			const container = document.createElement('div');
			const primary = new Error('superseded Suspense ref');
			const reports: unknown[] = [];
			const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
			let advance!: () => void;
			let resolve!: () => void;
			let clicks = 0;
			let oldReleases = 0;
			const resources = new Map<HTMLElement, number>();
			const ref = (node: HTMLElement | null) => {
				if (node) {
					resources.set(node, 0);
					return () => resources.set(node, resources.get(node)! + 1);
				}
			};
			const oldRef = (node: HTMLElement | null) => {
				if (node)
					return () => {
						oldReleases++;
						if (fails) throw primary;
					};
			};
			const pending = new Promise<void>((accept) => (resolve = accept));
			function Content() {
				const [count, setCount] = api.useState(0);
				return api.createElement(
					'button',
					{
						ref,
						onClick: () => {
							clicks++;
							setCount(count + 1);
						}
					},
					'ready ' + count
				);
			}
			const Lazy = api.lazy(async () => {
				await pending;
				return { default: Content };
			});
			function App() {
				const [next, setNext] = api.useState(false);
				const [, start] = api.useTransition();
				advance = () => start(() => setNext(true));
				return api.createElement(
					api.Suspense,
					{ fallback: 'loading' },
					next
						? api.createElement(suspended ? Lazy : Content)
						: api.createElement('span', { ref: oldRef }, 'old')
				);
			}
			try {
				await api.act(() => root.render(api.createElement(App)));
				await api.act(() => advance());
				if (suspended) {
					check(
						container.textContent === 'old' && oldReleases === 0,
						'pending candidate preserves committed content'
					);
					await api.act(async () => {
						resolve();
						await pending;
					});
				}
				const button = container.querySelector('button')!;
				check(!!button && button.textContent === 'ready 0', 'accepted content is published');
				check(oldReleases === 1, 'old resources retire once');
				check(
					reports.length === (fails ? 1 : 0) && (!fails || reports[0] === primary),
					'cleanup failure has one owner'
				);
				await api.act(() => button.click());
				check(
					button === container.querySelector('button') && button.textContent === 'ready 1',
					'next interaction retains accepted DOM'
				);
				await api.act(() => root.unmount());
				check(
					[...resources.values()].every((count) => count === 1),
					'every prepared ref resource releases exactly once'
				);
				check(container.childNodes.length === 0, 'root removal retires accepted content');
				for (const node of resources.keys()) node.click();
				check(clicks === 1, 'retired candidate listeners are removed');
			} finally {
				resolve();
				root.unmount();
			}
		}
	const container = document.createElement('div');
	const reports: unknown[] = [];
	const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
	let resolve!: () => void;
	let advance!: () => void;
	let renders = 0;
	const pending = new Promise<void>((accept) => (resolve = accept));
	const Lazy = api.lazy(async () => {
		await pending;
		return {
			default: () => {
				renders++;
				return api.createElement('button', null, 'late');
			}
		};
	});
	function Retired() {
		const [next, setNext] = api.useState(false);
		const [, start] = api.useTransition();
		advance = () => start(() => setNext(true));
		return api.createElement(
			api.Suspense,
			{ fallback: 'loading' },
			next ? api.createElement(Lazy) : 'committed'
		);
	}
	try {
		await api.act(() => root.render(api.createElement(Retired)));
		await api.act(() => advance());
		await api.act(() => root.unmount());
		await api.act(async () => {
			resolve();
			await pending;
		});
		check(
			renders === 0 && reports.length === 0 && container.childNodes.length === 0,
			'retired promise candidate cannot render or report'
		);
	} finally {
		resolve();
		root.unmount();
	}
}
