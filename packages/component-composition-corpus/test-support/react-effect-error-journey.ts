type ReactEffectErrorApi = Pick<
	typeof import('@exactjs/react-compat'),
	| 'Component'
	| 'act'
	| 'createElement'
	| 'useState'
	| 'useInsertionEffect'
	| 'useLayoutEffect'
	| 'useEffect'
> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('React effect errors: ' + message);
}

/** Checks owning error reports and recovery for initial passive work, update commits, and retired microtasks. */
export async function verifyReactEffectErrors(
	api: ReactEffectErrorApi,
	document: Document
): Promise<void> {
	for (const kind of ['insertion', 'layout', 'passive'] as const)
		for (const phase of ['create', 'cleanup'] as const) {
			const container = document.createElement('div');
			const reports: unknown[] = [];
			const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
			const primary = new Error(kind + ' ' + phase);
			let releases = 0;
			function Item() {
				const [step, setStep] = api.useState(0);
				const effect =
					kind === 'insertion'
						? api.useInsertionEffect
						: kind === 'layout'
							? api.useLayoutEffect
							: api.useEffect;
				effect(() => {
					if (phase === 'create' && step === 1) throw primary;
					return () => {
						releases++;
						if (phase === 'cleanup' && step === 0) throw primary;
					};
				}, [step]);
				return api.createElement('button', { onClick: () => setStep(step + 1) }, String(step));
			}
			try {
				await api.act(() => root.render(api.createElement(Item)));
				const button = container.querySelector('button')!;
				await api.act(() => button.click());
				check(reports.length === 1 && reports[0] === primary, kind + ' ' + phase + ' reports once');
				await api.act(() => button.click());
				check(
					button.textContent === '2' && container.querySelector('button') === button,
					'following work retains DOM'
				);
				await api.act(() => root.unmount());
				check(
					releases === 2 && reports.length === 1,
					'recovery releases each accepted resource once'
				);
			} finally {
				root.unmount();
				container.remove();
			}
		}
	const container = document.createElement('div');
	const reports: unknown[] = [];
	const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
	const primary = new Error('initial passive effect');
	let releases = 0;
	function Initial(props: { fail: boolean }) {
		api.useEffect(() => {
			if (props.fail) throw primary;
			return () => {
				releases++;
			};
		}, [props.fail]);
		return api.createElement('button', null, String(props.fail));
	}
	try {
		await api.act(() => root.render(api.createElement(Initial, { fail: true })));
		check(reports.length === 1 && reports[0] === primary, 'initial passive failure reaches root');
		const button = container.querySelector('button');
		await api.act(() => root.render(api.createElement(Initial, { fail: false })));
		check(
			button?.textContent === 'false' && container.querySelector('button') === button,
			'initial failure permits following render'
		);
		await api.act(() => root.unmount());
		check(releases === 1 && reports.length === 1, 'initial recovery resource releases');
	} finally {
		root.unmount();
		container.remove();
	}
	for (const update of [false, true]) {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
		let starts = 0;
		let releases = 0;
		function Retired() {
			const [step, setStep] = api.useState(0);
			api.useEffect(() => {
				starts++;
				if (!update || step === 1) throw new Error('retired passive work');
				return () => {
					releases++;
				};
			}, [step]);
			return api.createElement('button', { onClick: () => setStep(1) });
		}
		try {
			if (update) await api.act(() => root.render(api.createElement(Retired)));
			await api.act(() => {
				if (update) container.querySelector('button')!.click();
				else root.render(api.createElement(Retired));
				root.unmount();
			});
			check(
				reports.length === 0 && starts === (update ? 1 : 0),
				'retired work neither executes nor reports'
			);
			check(releases === (update ? 1 : 0), 'retirement releases only accepted work');
		} finally {
			root.unmount();
			container.remove();
		}
	}
	{
		const container = document.createElement('div');
		const caught: unknown[] = [];
		const uncaught: unknown[] = [];
		const didCatch: unknown[] = [];
		const root = api.createRoot(container, {
			onCaughtError: (error) => caught.push(error),
			onUncaughtError: (error) => uncaught.push(error)
		});
		const primary = new Error('passive boundary');
		function Child() {
			api.useEffect(() => {
				throw primary;
			}, []);
			return api.createElement('button', null, 'child');
		}
		class Boundary extends api.Component<{}, { failed: boolean }> {
			state = { failed: false };
			static getDerivedStateFromError() {
				return { failed: true };
			}
			componentDidCatch(error: unknown) {
				didCatch.push(error);
			}
			render() {
				return this.state.failed
					? api.createElement('p', null, 'recovered')
					: api.createElement(Child);
			}
		}
		try {
			await api.act(() => root.render(api.createElement(Boundary)));
			check(
				caught.length === 1 &&
					caught[0] === primary &&
					didCatch.length === 1 &&
					didCatch[0] === primary,
				'nearest boundary receives passive failure once'
			);
			check(
				uncaught.length === 0 && container.textContent === 'recovered',
				'boundary recovery remains local'
			);
			await api.act(() => root.unmount());
			check(container.childNodes.length === 0, 'boundary releases recovered range');
		} finally {
			root.unmount();
			container.remove();
		}
	}
}
