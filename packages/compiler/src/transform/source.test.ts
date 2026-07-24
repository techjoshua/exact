import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform, transformSource } from '../index.js';

describe('@exactjs/compiler: transform', () => {
	it('lowers annotated object and primitive Array.map JSX to keyed framework lists', () => {
		const output = transform(`
      type Task = { /** @exact key */ id: string; title: string };
      function View(this: Component<{}>, props: { tasks: Task[]; labels: string[] }) {
        return () => <section>
          {props.tasks.map(task => <p>{task.title}</p>)}
          {props.labels.map(label => <i>{label}</i>)}
        </section>;
      }
    `);
		expect(output).toContain('this.map(props.tasks');
		expect(output).toMatch(/__exactItem_?\d* => __exactItem_?\d*\.id/);
		expect(output).toContain('this.map(props.labels');
	});

	it('lets a local key annotation adapt an external structural type', () => {
		const output = transform(`
      type ExternalTask = { externalId: string; title: string };
      function View(this: Component<{}>, props: { tasks: ExternalTask[] }) {
        const tasks /** @exact key=externalId */ = props.tasks;
        return () => <section>{tasks.map(task => <p>{task.title}</p>)}</section>;
      }
    `);
		expect(output).toContain('this.map(tasks');
		expect(output).toMatch(/__exactItem_?\d* => __exactItem_?\d*\.externalId/);
	});

	it('preserves native map semantics when a render callback uses the index', () => {
		const output = transform(`
      type Task = { /** @exact key */ id: string };
      function View(this: Component<{}>, props: { tasks: Task[] }) {
        return () => <section>{props.tasks.map((task, index) => <p>{index}:{task.id}</p>)}</section>;
      }
    `);
		expect(output).toContain('props.tasks.map((task, index)');
		expect(output).not.toContain('this.map(props.tasks');
	});

	it('preserves native map semantics for module-level declarative collections', () => {
		const output = transform(`
			type Page = { /** @exact key */ path: string; component: ComponentFunction };
			function Route() { return null; }
			const pages: Page[] = [];
			function App(this: Component<{}>) {
				return () => <Route>{pages.map(page => <Route path={page.path} component={page.component} />)}</Route>;
			}
		`);
		expect(output).toContain('pages.map(page =>');
		expect(output).not.toContain('this.map(pages');
		expect(output).not.toContain('__exactDynamic(() => pages.map');
	});

	it('reports malformed compiler annotations at their source line', () => {
		expect(() =>
			transform(
				`
      /** @exact unicornName=Airy */
      interface Pony {}
    `,
				{ filename: 'invalid-directive.ts' }
			)
		).toThrow(/invalid-directive\.ts:2:\d+ - error: unknown @exact directive 'unicornName'/);
	});

	it('owns resources through annotated legacy cleanup contracts', () => {
		const output = transform(`
      interface LegacySubscription { /** @exact cleanup */ release(): Promise<void> }
      declare function subscribe(): /** @exact own */ LegacySubscription;
      function View(this: Component<{}>) {
        this.task.client(() => { const subscription = subscribe(); });
        return () => <p>ready</p>;
      }
    `);
		expect(output).toContain('ownTaskResource as __exactTaskResource');
		expect(output).toMatch(
			/__exactTaskResource\(__exact(?:Task)?Signal, subscribe\(\), "release"\)/
		);
	});

	it('makes tracked callback calculations eligible for compiler-derived caching', () => {
		const output = transform(`
      declare function select<T>(/** @exact track */ calculate: () => T): T;
      function View(this: Component<{ count: number }>) {
        const label = select(() => \`count \${this.state.count}\`);
        return () => <p>{label}</p>;
      }
    `);
		expect(output).toContain('createDerived as __exactDerived');
		expect(output).toContain(
			'const label = __exactDerived(() => select(() => `count ${this.state.count}`))'
		);
	});

	it('uses one semantic component identity across analysis and emission', () => {
		const result = transformSource(
			`export function panel(this: Component<{ count: number }>) {
      this.state.count = 1;
      window.addEventListener("resize", () => {});
      return () => <p>{this.state.count}</p>;
    }`,
			{ filename: 'lowercase-component.tsx' }
		);

		expect(result.manifest.components).toContainEqual(expect.objectContaining({ name: 'panel' }));
		expect(result.code).toContain('__exactWrite(this.state');
		expect(result.code).toContain('__exactAbortOptions');
		expect(result.code).toContain('__exactVNode("p"');
	});

	it('rejects task registration inside render functions and callbacks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{}>) {
      return () => { this.task(() => undefined); return <p />; };
    }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('this.task() must be registered directly during component setup');
	});

	it('preserves contextual event parameter types when lowering JSX', () => {
		const filename = path.resolve(
			import.meta.dirname,
			'../../../../apps/workbench/src/__contextual_events.tsx'
		);
		const output = transform(
			`function Form(this: Component<{}>) {
      return () => <form onSubmit={event => event.preventDefault()}><input onInput={event => event.preventDefault()} /></form>;
    }`,
			{ filename }
		);
		expect(output).toContain('JSX.TargetedEvent<HTMLFormElement, SubmitEvent>');
		expect(output).toContain('JSX.TargetedEvent<HTMLInputElement, InputEvent>');
		expect(output).toContain('import("@exactjs/jsx/jsx-runtime")');
		expect(output).not.toContain('packages/jsx-runtime/dist/jsx-runtime');
	});

	it('lowers recognized component state writes to conditional runtime helpers', () => {
		const output = transform(
			`function Counter(this: Component<{ count: number; items: string[]; label?: string }>) {
      this.state.count += 2;
      this.state.count++;
      delete this.state.label;
      this.state.items.push("next");
      return () => <p />;
    }`,
			{ filename: 'Counter.tsx' }
		);
		expect(output).toContain('updateReactiveValue as __exactUpdate');
		expect(output).toContain('updateReactiveValueWithResult as __exactUpdateResult');
		expect(output).toContain('deleteReactiveValue as __exactDelete');
		expect(output).toContain('mutateReactiveArray as __exactArrayMutation');
		expect(output).toContain('__exactUpdate(this.state, ["count"]');
		expect(output).toContain('__exactUpdateResult(this.state, ["count"]');
		expect(output).toContain('__exactDelete(this.state, ["label"])');
		expect(output).toContain('__exactArrayMutation(this.state, ["items"], "push"');
	});

	it("preserves a state alias when a nested object method has its own 'this'", () => {
		const output = transform(
			`
      function ThemeProvider(this: Component<{ preference: string }>) {
        this.state.preference = "system";
        const state = this.state;
        const theme = {
          get preference() { return state.preference; },
          setPreference(preference: string) { state.preference = preference; }
        };
        return () => <button onClick={() => theme.setPreference("dark")}>{theme.preference}</button>;
      }`,
			{ filename: 'ThemeProvider.tsx' }
		);

		expect(output).toContain('__exactWrite(state.get(), ["preference"]');
		expect(output).not.toMatch(/setPreference[\s\S]*?__exactWrite\(this\.state/);
	});

	it('owns browser-global listeners declared in component setup', () => {
		const output = transform(
			`function Panel(this: Component<{}>) { window.addEventListener("resize", () => {}); return () => <p />; }`,
			{ filename: 'Panel.tsx' }
		);
		expect(output).toContain('this.task.client(({ signal: __exactSignal }) =>');
		expect(output).toContain('window.addEventListener');
		expect(output).toContain('__exactAbortOptions(undefined, __exactSignal)');
		const server = transform(
			`function Panel(this: Component<{}>) { window.addEventListener("resize", () => {}); return () => <p />; }`,
			{ filename: 'Panel.tsx', target: 'server' }
		);
		expect(server).not.toContain('addEventListener');
	});

	it('owns cancellable and disposable resources declared directly in component setup', () => {
		const output = transform(
			`
      declare function load(options?: { signal?: AbortSignal; priority?: number }): Promise<void>;
      declare function disposableApi(): Disposable;
      declare const bus: EventTarget;
      function Panel(this: Component<{}>) {
        setInterval(() => {}, 10);
        new ResizeObserver(() => {}).observe(document.body);
        new WebSocket("/events");
        disposableApi();
        load({ priority: 1 });
        bus.addEventListener("message", () => {});
        return () => <p />;
      }
    `,
			{ filename: 'SetupResources.tsx' }
		);
		expect(output.match(/this\.task\.client/g)).toHaveLength(6);
		expect(output).toContain('__exactTaskInterval(__exactSignal');
		expect(output).toContain('__exactTaskObserver(__exactSignal, new ResizeObserver');
		expect(output).toContain(
			'__exactTaskResource(__exactSignal, new WebSocket("/events"), "close")'
		);
		expect(output).toContain('__exactTaskResource(__exactSignal, disposableApi())');
		expect(output).toContain('load(__exactTaskOptionsSignal({ priority: 1 }, __exactSignal))');
		expect(output).toContain(
			'bus.addEventListener("message", () => { }, __exactTaskOptionsSignal(undefined, __exactSignal))'
		);
	});

	it('requires explicit task ownership when a setup resource value escapes', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{}>) {
      const socket = new WebSocket("/events");
      return () => <p>{socket.readyState}</p>;
    }`,
				{ filename: 'EscapingSetupResource.tsx' }
			)
		).toThrow('setup-created WebSocket cannot be owned without changing its expression result');
	});

	it('allows abort-scoped browser-global listeners inside component tasks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{}>) { this.task.client(({ signal }) => { window.addEventListener("resize", () => {}, { signal }); }); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).not.toThrow();
	});

	it('injects task abort ownership into global listeners', () => {
		const output = transform(
			`function Panel(this: Component<{}>) { this.task.client(() => { window.addEventListener("resize", () => {}); }); return () => <p />; }`,
			{ filename: 'Panel.tsx' }
		);
		expect(output).toContain('withAbortSignal as __exactAbortOptions');
		expect(output).toContain('({ signal: __exactSignal })');
		expect(output).toContain('__exactAbortOptions(undefined, __exactSignal)');
	});

	it('owns canonical async resources and guards post-await task continuations', () => {
		const output = transform(
			`function Panel(this: Component<{ loaded: boolean }>) {
      this.task.client(async () => {
        setTimeout(() => {}, 10);
        setInterval(() => {}, 20);
        requestAnimationFrame(() => {});
        new ResizeObserver(() => {}).observe(document.body);
        await fetch("/tasks");
        this.state.loaded = true;
      });
      return () => <p />;
    }`,
			{ filename: 'ManagedResources.tsx' }
		);
		expect(output).toContain('taskTimeout as __exactTaskTimeout');
		expect(output).toContain('taskInterval as __exactTaskInterval');
		expect(output).toContain('taskAnimationFrame as __exactTaskAnimationFrame');
		expect(output).toContain('taskObserver as __exactTaskObserver');
		expect(output).toContain('taskFetch as __exactTaskFetch');
		expect(output).toContain('taskAwait as __exactTaskAwait');
		expect(output).toContain(
			'__exactTaskAwait(__exactSignal, __exactTaskFetch(__exactSignal, fetch, "/tasks"))'
		);
	});

	it('owns disposable task resources and injects signals from call signatures', () => {
		const output = transform(
			`
      declare function optionsApi(value: string, options?: { signal?: AbortSignal; priority?: number }): void;
      declare function directApi(value: string, signal?: AbortSignal): void;
      declare function disposableApi(): Disposable;
      declare const store: { subscribe(callback: () => void): { unsubscribe(): void } };
      function Panel(this: Component<{}>) {
        this.task.client(() => {
          requestIdleCallback(() => {});
          const socket = new WebSocket("/events");
          const events = new EventSource("/events");
          const channel = new BroadcastChannel("updates");
          const worker = new Worker("worker.js");
          const disposable = disposableApi();
          const subscription = store.subscribe(() => {});
          optionsApi("ready", { priority: 1 });
          directApi("ready");
          void socket.readyState;
          void events.readyState;
          void channel.name;
          worker.postMessage("ready");
        });
      }
    `,
			{ filename: 'OwnedResources.tsx' }
		);
		expect(output).toContain('taskIdleCallback as __exactTaskIdleCallback');
		expect(output).toContain('ownTaskResource as __exactTaskResource');
		expect(output).toContain('withTaskSignal as __exactTaskOptionsSignal');
		expect(output).toContain('combineTaskSignal as __exactTaskCombinedSignal');
		expect(output).toContain('__exactTaskIdleCallback(__exactSignal, () => { })');
		expect(output).toContain(
			'__exactTaskResource(__exactSignal, new WebSocket("/events"), "close")'
		);
		expect(output).toContain(
			'__exactTaskResource(__exactSignal, new Worker("worker.js"), "terminate")'
		);
		expect(output).toContain('__exactTaskResource(__exactSignal, disposableApi())');
		expect(output).toContain(
			'__exactTaskResource(__exactSignal, store.subscribe(() => { }), "unsubscribe")'
		);
		expect(output).toContain(
			'optionsApi("ready", __exactTaskOptionsSignal({ priority: 1 }, __exactSignal))'
		);
		expect(output).toContain('directApi("ready", __exactTaskCombinedSignal(__exactSignal))');
	});

	it('requires explicit ownership when a disposable task resource escapes', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ socket?: WebSocket }>) {
      this.task.client(() => { this.state.socket = new WebSocket("/events"); });
    }`,
				{ filename: 'EscapingResource.tsx' }
			)
		).toThrow('WebSocket escapes its task generation');
	});

	it('reports task ownership failures at their source location', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ socket?: WebSocket }>) {
      this.task.client(() => { this.state.socket = new WebSocket("/events"); });
    }`,
				{ filename: 'LocatedResource.tsx' }
			)
		).toThrow(/LocatedResource\.tsx:2:\d+ - error:/);
	});

	it('rejects setup-time state snapshots captured by async callbacks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ title: string }>) { const title = this.state.title; setTimeout(() => console.log(title)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('setup-time state snapshot');
	});

	it('rejects setup-time state snapshots captured by Promise callbacks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ title: string }>) { const title = this.state.title; Promise.resolve().then(() => console.log(title)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('setup-time state snapshot');
	});

	it('does not confuse a callback-local shadow with a setup state snapshot', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ title: string }>) { const title = this.state.title; setTimeout(() => { const title = "local"; console.log(title); }); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).not.toThrow();
	});

	it('rejects direct reactive prop and context snapshots captured by async callbacks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{}>, props: { title: string }) { const title = props.title; setTimeout(() => console.log(title)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('setup-time state snapshot');
		expect(() =>
			transform(
				`function Panel(this: Component<{}>) { const locale = this.getContext(Locale); queueMicrotask(() => console.log(locale)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('setup-time state snapshot');
	});

	it('allows an explicit peek snapshot in an async callback', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ title: string }>) { const title = peek(() => this.state.title); Promise.resolve().then(() => console.log(title)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).not.toThrow();
	});

	it('rejects setup-time state snapshots captured by animation callbacks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ title: string }>) { const title = this.state.title; requestAnimationFrame(() => console.log(title)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('setup-time state snapshot');
	});

	it('rejects setup-time state snapshots captured by observer callbacks', () => {
		expect(() =>
			transform(
				`function Panel(this: Component<{ title: string }>) { const title = this.state.title; new MutationObserver(() => console.log(title)); return () => <p />; }`,
				{ filename: 'Panel.tsx' }
			)
		).toThrow('setup-time state snapshot');
	});
});
