type ReactEventApi = Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot' | 'hydrateRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('React host events: ' + message);
}

/** Observes event failures at intrinsic and component roots through mounting, adoption, and release. */
export async function verifyReactHostEvents(api: ReactEventApi, document: Document): Promise<void> {
	for (const owned of [false, true])
		for (const adopted of [false, true]) {
			const errors: unknown[] = [];
			const recoveries: unknown[] = [];
			const primary = new Error('authored event failure');
			let phase: 'throw' | 'reject' | 'success' | 'pending' = 'throw';
			let calls = 0;
			let finish!: () => void;
			let root: ReturnType<typeof api.createRoot> | undefined;
			const container = document.createElement('div');
			function handler(this: Element, event: Event) {
				check(this === event.currentTarget, 'native receiver and currentTarget are preserved');
				calls++;
				if (phase === 'throw') throw primary;
				if (phase === 'reject') return Promise.reject(primary);
				if (phase === 'pending')
					return new Promise<void>((resolve) => {
						finish = resolve;
					}).then(() => {
						throw new Error('retired event');
					});
			}
			function Page() {
				return api.createElement('button', { onClick: handler }, 'run');
			}
			const value = owned ? api.createElement(Page) : Page();
			try {
				let original: Element | null = null;
				await api.act(() => {
					const options = {
						onUncaughtError: (error: unknown) => errors.push(error),
						onRecoverableError: (error: unknown) => recoveries.push(error)
					};
					if (adopted) {
						container.innerHTML = '<button>run</button>';
						original = container.firstElementChild;
						root = api.hydrateRoot(container, value, options);
					} else {
						root = api.createRoot(container, options);
						root.render(value);
					}
				});
				const button = container.querySelector('button')!;
				check(!adopted || button === original, 'hydration retains the server button');
				check(recoveries.length === 0, 'valid hydration needs no recovery');
				await api.act(() => button.click());
				check(
					errors.length === 1 && errors[0] === primary,
					`synchronous failure reaches the local reporter once (owned=${owned}, adopted=${adopted}, reports=${errors.length}, calls=${calls}, messages=${errors.map(String).join('|')})`
				);
				phase = 'reject';
				await api.act(() => button.click());
				check(
					errors.length === 2 && errors[1] === primary,
					'returned rejection reaches the same owner once'
				);
				phase = 'success';
				await api.act(() => button.click());
				check(
					calls === 3 && errors.length === 2 && container.querySelector('button') === button,
					'following work retains its node and handler'
				);
				phase = 'pending';
				await api.act(() => button.click());
				if (owned) {
					await api.act(() => root!.render(api.createElement('p', null, 'replacement')));
					await api.act(() => {
						finish();
						button.click();
					});
					check(
						errors.length === 2 && calls === 4 && container.textContent === 'replacement',
						'retired component work does not report through a retained root'
					);
				}
				await api.act(() => root!.unmount());
				await api.act(() => {
					finish();
					button.click();
				});
				check(
					calls === 4 && errors.length === 2 && container.childNodes.length === 0,
					'released work cannot report to or reactivate its root'
				);
			} finally {
				finish?.();
				await api.act(() => root?.unmount());
			}
		}
}
