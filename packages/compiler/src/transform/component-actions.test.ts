import { describe, expect, it } from 'vitest';

import { analyzeSource, transform } from '../index.js';

describe('@exactjs/compiler: component actions', () => {
	it('preserves named action registration while lowering owned state effects', () => {
		const output = transform(
			`
				function Editor(this: Component<{ title: string }>) {
					const save = this.action(
						"save title",
						async (title: string, { signal }: ActionContext) => {
							this.state.title = await saveTitle(title, { signal });
						},
						"latest"
					);
					return () => <button onClick={() => save("next")}>Save</button>;
				}
			`,
			{ filename: 'Editor.tsx' }
		);

		expect(output).toContain('this.action(');
		expect(output).toContain('"save title"');
		expect(output).toContain('"latest"');
		expect(output).toContain('__exactWrite(this.state, ["title"]');
		expect(output).toContain('__exactInteractionMutation(signal, () =>');
		expect(output).toContain('await __exactInteractionAwait(signal, saveTitle(title, { signal }))');
	});

	it('injects a private cancellation context for context-free async actions', () => {
		const output = transform(
			`
				function Search(this: Component<{ result: string }>) {
					const search = this.action("search", async (query: string) => {
						this.state.result = await findResult(query);
					}, "latest");
					return () => <button onClick={() => search("term")}>Search</button>;
				}
			`,
			{ filename: 'Search.tsx' }
		);

		expect(output).toContain('async (query: string, { signal: __exactSignal }) =>');
		expect(output).toContain('await __exactInteractionAwait(__exactSignal, findResult(query))');
		expect(output).toContain('__exactInteractionMutation(__exactSignal, () =>');
	});

	it('fences state commits even when authored code catches cancellation', () => {
		const output = transform(
			`
				function Search(this: Component<{ result: string }>) {
					const search = this.action("search", async ({ signal }: ActionContext) => {
						try {
							await findResult();
						} catch {
							this.state.result = "fallback";
						}
					}, "latest");
					return () => <button onClick={() => search()}>Search</button>;
				}
			`,
			{ filename: 'Search.tsx' }
		);

		expect(output).toContain(
			'__exactInteractionMutation(signal, () => __exactWrite(this.state, ["result"]'
		);
	});

	it('rejects action registration from rerunnable render work', () => {
		expect(() =>
			transform(
				`
					function Editor() {
						return () => {
							this.action.server.deferred("save", async () => undefined);
							return <p />;
						};
					}
				`,
				{ filename: 'Editor.tsx' }
			)
		).toThrow('render functions may not register action work');
	});

	it('rejects nested registration and render-phase invocation', () => {
		expect(() =>
			transform(
				`
					function Editor() {
						function register() {
							return this.action("save", async () => undefined);
						}
						return () => <button />;
					}
				`,
				{ filename: 'Editor.tsx' }
			)
		).toThrow('must be registered directly during component setup');

		expect(() =>
			transform(
				`
					function Editor() {
						const save = this.action("save", async () => undefined);
						return () => <button disabled={save()}>Save</button>;
					}
				`,
				{ filename: 'Editor.tsx' }
			)
		).toThrow('may not be invoked during rerunnable render work');
	});

	it('rejects unsafe optimistic and ActionContext usage', () => {
		expect(() =>
			transform(
				`
					function Editor(this: Component<{ title: string }>) {
						this.action("save", async ({ optimistic }: ActionContext) => {
							optimistic(() => {
								this.state.title = "next";
							});
						});
						return () => <p />;
					}
				`,
				{ filename: 'Editor.tsx' }
			)
		).toThrow("requires 'latest' or 'queue'");

		expect(() =>
			transform(
				`
					function Editor(this: Component<{ title: string }>) {
						this.action("save", async ({ optimistic }: ActionContext) => {
							optimistic(async () => {
								this.state.title = await loadTitle();
							});
						}, "latest");
						return () => <p />;
					}
				`,
				{ filename: 'Editor.tsx' }
			)
		).toThrow('callbacks must be synchronous');

		expect(() =>
			transform(
				`
					function Editor() {
						this.action("save", async (context: ActionContext) => {
							storeContext(context);
						});
						return () => <p />;
					}
				`,
				{ filename: 'Editor.tsx' }
			)
		).toThrow('ActionContext may not escape');
	});

	it('emits paired client/server continuation contracts for server actions', () => {
		const source = `
			/** @exact server */
			declare function persistTitle(id: string, title: string): Promise<number>;

			export function Editor(this: Component<{ title: string }>) {
				const save = this.action.server(
					"save title",
					async (
						id: string,
						title: string,
						{ signal, optimistic }: ActionContext
					) => {
						optimistic(() => {
							this.state.title = title;
						});
						if (signal.aborted) return -1;
						this.state.title = title;
						return persistTitle(id, title);
					},
					"queue"
				);
				return () => <button onClick={() => save("1", "next")}>Save</button>;
			}
		`;
		const manifest = analyzeSource(source, { filename: 'Editor.tsx' });
		const client = transform(source, { filename: 'Editor.tsx', target: 'client' });
		const server = transform(source, { filename: 'Editor.tsx', target: 'server' });
		const continuation = manifest.continuations[0]!;

		expect(continuation).toMatchObject({
			kind: 'action',
			label: 'save title',
			ownership: { lifetime: 'invocation' },
			invocation: {
				concurrency: 'queue',
				arguments: [
					{ index: 0, source: 'argument' },
					{ index: 1, source: 'argument' }
				]
			}
		});
		expect(client).toContain('dispatchComponentContinuation as __exactDispatchContinuation');
		expect(client).toContain(`"${continuation.id}", __exactActionArgs`);
		expect(client).toContain('[], __exactActionContext.generation');
		expect(client).toContain('optimistic(() =>');
		expect(server).toContain('executors: [');
		expect(server).toContain('value: __exactActionResult_');
		expect(server).toContain('persistTitle(');
		expect(server).toContain('generation: __exactActivation_');
		expect(server).not.toContain('optimistic(() =>');
	});
});
