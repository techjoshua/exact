type ReactCleanupApi = Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('React cleanup: ' + message);
}

/** Crosses throwing refs with complete forest retirement, listener release, replacement and remounting. */
export async function verifyReactCleanup(api: ReactCleanupApi, document: Document): Promise<void> {
	for (const replace of [false, true])
		for (const primary of [new Error('ref cleanup'), undefined, 0]) {
			const container = document.createElement('div');
			const reports: unknown[] = [];
			const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
			let first: HTMLButtonElement | undefined;
			let firstReleases = 0;
			let secondReleases = 0;
			let events = 0;
			let replacementReleases = 0;
			try {
				await api.act(() =>
					root.render(
						api.createElement(
							'section',
							null,
							api.createElement(
								'button',
								{
									onClick: () => events++,
									ref: (node: HTMLButtonElement | null) => {
										if (node) first = node;
										else {
											firstReleases++;
											first!.click();
											throw primary;
										}
									}
								},
								'first'
							),
							api.createElement(
								'button',
								{
									ref: (node: Element | null) => {
										if (!node) secondReleases++;
									}
								},
								'second'
							)
						)
					)
				);
				let failed = false;
				let error: unknown;
				try {
					await api.act(() => {
						if (replace)
							root.render(
								api.createElement(
									'article',
									{
										ref: (node: Element | null) => {
											if (!node) replacementReleases++;
										}
									},
									'replacement'
								)
							);
						else root.unmount();
					});
				} catch (caught) {
					failed = true;
					error = caught;
				}
				check(
					failed && error === primary,
					'retirement preserves non-object and ordinary primary errors'
				);
				check(
					firstReleases === 1 && secondReleases === 1 && events === 0,
					'all refs retire once and listeners are gone before ref callbacks'
				);
				check(
					replace ? container.textContent === 'replacement' : container.childNodes.length === 0,
					'old DOM is removed while accepted replacements remain'
				);
				if (replace) {
					check(
						reports.length === 1 && reports[0] === primary,
						'replacement failure reaches the root reporter once'
					);
					await api.act(() => root.render(api.createElement('p', null, 'next')));
					check(
						replacementReleases === 1 && container.textContent === 'next',
						'following work retires the replacement through its retained ownership'
					);
				} else check(reports.length === 0, 'direct unmount preserves its caller-owned failure');
				await api.act(() => root.unmount());
				check(container.childNodes.length === 0, 'final teardown leaves no owned DOM');
				const next = api.createRoot(container);
				try {
					await api.act(() => next.render(api.createElement('p', null, 'remount')));
					check(container.textContent === 'remount', 'a retired container supports a new owner');
				} finally {
					await api.act(() => next.unmount());
				}
			} finally {
				await api.act(() => root.unmount());
				container.remove();
			}
		}
}
