import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from '../index.js';

describe('@exactjs/compiler: JSX reactivity', () => {
	it('lowers shorthand and underscore fragments', () => {
		const output = transform('const view = <_ key={id}><span /></_>; const next = <>tail</>;');

		expect(output).toContain('__exactFragment({ key: id }');
		expect(output).toContain('__exactVNode("span"');
		expect(output).toContain('__exactFragment({}');
	});

	it('preserves explicit JSX keys as the manual identity fallback for native maps', () => {
		const output = transform(
			`type Todo = { id: string; text: string };
      function List(this: Component<{ todos: Todo[] }>) {
        return () => <ul>{this.state.todos.map(todo => <li key={todo.id}>{todo.text}</li>)}</ul>;
      }`,
			{ filename: 'ExplicitKey.tsx' }
		);

		expect(output).toContain('key: todo.id');
		expect(output).toContain('this.state.todos.map');
		expect(output).not.toContain('this.map(this.state.todos');
	});

	it('lowers expression children to dynamic child boundaries', () => {
		const output = transform(
			'const view = <section>{show ? <span>A</span> : <strong>B</strong>}</section>;'
		);

		expect(output).toContain('__exactDynamic(() => show ? __exactVNode("span"');
		expect(output).toContain(': __exactVNode("strong"');
	});

	it('preserves event handlers as direct functions', () => {
		const output = transform('const view = <button onClick={() => save()} disabled={disabled} />;');

		expect(output).toContain('onClick: () => save()');
		expect(output).toContain('disabled: __exactExpression(() => disabled)');
	});

	it('lowers typed form bindings to reactive props and direct binding handlers', () => {
		const output = transform(
			`declare class Component<S> { state: S }
			function View(this: Component<{
				name: string;
				count: number | null;
				enabled: boolean;
				method: "ground" | "express";
				tags: string[];
				providers: ("ups" | "fedex")[] | null;
				codes: number[];
				birthday: Date | null;
				nickname?: string;
			}>) {
				return () => <>
					<input value:input={this.state.name} />
					<input type="number" value:change={this.state.count} />
					<input type="checkbox" checked:change={this.state.enabled} />
					<input type="radio" value="ground" checked:change={this.state.method} />
					<select multiple value:change={this.state.tags}><option value="a">A</option></select>
					<input type="checkbox" value="ups" checked:change={this.state.providers} />
					<input type="checkbox" value="2" checked:change={this.state.codes} />
					<input type="date" value:change={this.state.birthday} />
					<input value:input={this.state.nickname} />
				</>;
			}`,
			{ filename: path.resolve(import.meta.dirname, 'binding-feature-fixture.tsx') }
		);

		expect(output).toContain('value: __exactExpression(() => this.state.name ?? "")');
		expect(output).toContain('this.state.name = event.currentTarget.value');
		expect(output).toContain(
			'event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber'
		);
		expect(output).toContain('Number.isNaN(this.state.count) ? "" : String(this.state.count)');
		expect(output).toContain('checked: __exactExpression(() => this.state.enabled ?? false)');
		expect(output).toContain('this.state.enabled = event.currentTarget.checked');
		expect(output).toContain('checked: __exactExpression(() => this.state.method === "ground")');
		expect(output).toContain('Array.from(event.currentTarget.selectedOptions');
		expect(output).toContain(
			'checked: __exactExpression(() => (this.state.providers ?? []).includes("ups"))'
		);
		expect(output).toContain('const value = event.currentTarget.value as any;');
		expect(output).toContain(
			'const next = event.currentTarget.checked ? values.includes(value) ? values : [...values, value] : values.filter(item => item !== value);'
		);
		expect(output).toContain('this.state.providers = next.length ? next : null;');
		expect(output).toContain(
			'checked: __exactExpression(() => (this.state.codes ?? []).includes(Number("2")))'
		);
		expect(output).toContain('const value = Number(event.currentTarget.value);');
		expect(output).toContain(
			'event.currentTarget.value === "" ? null : event.currentTarget.valueAsDate'
		);
		expect(output).toContain(
			'event.currentTarget.value === "" ? undefined : event.currentTarget.value'
		);
		expect(output).toContain('__exactBindInput:');
		expect(output).toContain('__exactBindChange:');
		expect(output).not.toContain('"value:input"');
		expect(output).not.toContain('"checked:change"');
	});

	it('requires checkbox array bindings to declare a value', () => {
		expect(() =>
			transform(
				`declare class Component<S> { state: S }
				 function View(this: Component<{ tags: string[] }>) {
					return () => <input type="checkbox" checked:change={this.state.tags} />;
				 }`,
				{ filename: 'InvalidCheckboxBinding.tsx' }
			)
		).toThrow(/checkbox array bindings require an explicit value prop/);
	});

	it('rejects derived and conflicting form bindings', () => {
		expect(() =>
			transform(
				`declare class Component<S> { state: S }
			 function View(this: Component<{ first: string; last: string }>) {
				return () => <input value="fixed" value:input={\`\${this.state.first} \${this.state.last}\`} />;
			 }`,
				{ filename: 'InvalidBinding.tsx' }
			)
		).toThrow(/value:input requires one writable reactive location/);
	});

	it('rejects removed and incompatible binding spellings', () => {
		expect(() =>
			transform(
				`declare class Component<S> { state: S }
				 function View(this: Component<{ name: string }>) {
					return () => <input bindInput={this.state.name} />;
				 }`,
				{ filename: 'RemovedBinding.tsx' }
			)
		).toThrow(/bindInput and bindChange were removed/);
		expect(() =>
			transform(
				`declare class Component<S> { state: S }
				 function View(this: Component<{ enabled: boolean }>) {
					return () => <input type="checkbox" value:change={this.state.enabled} />;
				 }`,
				{ filename: 'WrongPropertyBinding.tsx' }
			)
		).toThrow(/value:change is not supported.*checked:change/);
		expect(() =>
			transform(
				`declare class Component<S> { state: S }
				 function View(this: Component<{ status: string }>) {
					return () => <select value:input={this.state.status} />;
				 }`,
				{ filename: 'WrongEventBinding.tsx' }
			)
		).toThrow(/value:input is not supported.*value:change/);
	});

	it('preserves ref bindings as direct values', () => {
		const output = transform('const view = <button ref={this.ref(button)} title={title} />;');

		expect(output).toContain('ref: this.ref(button)');
		expect(output).toContain('title: __exactExpression(() => title)');
		expect(output).not.toContain('ref: __exactExpression');
	});

	it('preserves spread prop ordering around compiled reactive props', () => {
		const output = transform(
			'const view = <Panel id="fixed" {...shared} title={title} {...extra} />;'
		);

		expect(output).toContain(
			'id: "fixed", ...shared, title: __exactExpression(() => title), ...extra'
		);
	});

	it('quotes non-identifier JSX prop names', () => {
		const output = transform('const view = <div data-task-id={task.id} aria-label="Task" />;');

		expect(output).toContain('"data-task-id": __exactExpression(() => task.id)');
		expect(output).toContain('"aria-label": "Task"');
	});

	it('captures this.reactive value arguments as expressions', () => {
		const output = transform('function View() { const query = this.reactive(this.state.query); }');

		expect(output).toContain('this.reactive(() => this.state.query)');
	});

	it('captures this.reactive tagged templates as expressions', () => {
		const output = transform(
			'function View() { const name = this.reactive`${this.state.first} ${this.state.last}`; }'
		);

		expect(output).toContain('this.reactive(() => `${this.state.first} ${this.state.last}`)');
	});

	it('captures this.task dependency arguments as component reactive values', () => {
		const output = transform(
			'function View() { this.task(this.state.query, this.state.page, async (query, page) => {}); }'
		);

		expect(output).toContain(
			'this.task(this.reactive(() => this.state.query), this.reactive(() => this.state.page), async (query, page) => { });'
		);
	});

	it('infers task dependencies from state reads while excluding write-only effects', () => {
		const output = transform(
			`function Search(this: Component<{ query: string; results: string[] }>) {
        this.task(async ({ signal }) => {
          const query = this.state.query;
          this.state.results = query ? [query] : [];
          await fetch("/search?q=" + query, { signal });
        });
      }`,
			{ filename: 'Search.tsx' }
		);

		expect(output).toContain(
			'this.task(this.reactive(() => this.state.query), async (__exactDependency, { signal }) =>'
		);
		expect(output).not.toContain('this.reactive(() => this.state.results)');
	});

	it('caches safe derived collection locals when they feed this.map', () => {
		const output = transform(
			`function Board(this: Component<{ tasks: { id: string; status: string }[] }>) {
      const todoTasks = this.state.tasks.filter(task => task.status === "todo");
      return () => this.map(todoTasks, task => task.id, task => <li>{task.id}</li>);
    }`,
			{ filename: 'Board.tsx' }
		);
		expect(output).toContain(
			'const todoTasks = __exactDerived(() => this.state.tasks.filter(task => task.status === "todo"));'
		);
		expect(output).toContain('this.map(todoTasks, task => task.id');
		expect(output).toContain(', this.state.tasks, "member:id"');
	});

	it('keeps expanded derived prop collections live when they feed this.map', () => {
		const output = transform(
			`function Column(this: Component<{}>, props: { tasks: { id: string; status: string }[]; column: { id: string } }) {
      const columnTasks = props.tasks.filter(task => task.status === props.column.id);
      return () => <section>{this.map(columnTasks, task => task.id, task => <li>{task.id}</li>)}</section>;
    }`,
			{ filename: 'Column.tsx' }
		);
		expect(output).toContain(
			'const columnTasks = __exactDerived(() => props.tasks.filter(task => task.status === props.column.id));'
		);
		expect(output).toContain('this.map(columnTasks, task => task.id');
		expect(output).toContain(', props.tasks, "member:id")))');
	});

	it('allows callback-local mutation but rejects captured writes in derived collections', () => {
		const local = transform(
			`function Board(this: Component<{ tasks: { id: string; status: string }[] }>) {
      const todoTasks = this.state.tasks.filter(task => { let match = false; match = task.status === "todo"; return match; });
      return () => this.map(todoTasks, task => task.id, task => <li>{task.id}</li>);
    }`,
			{ filename: 'Board.tsx' }
		);
		expect(local).toContain('const todoTasks = __exactDerived(() => this.state.tasks.filter');
		expect(local).toContain('this.map(todoTasks, task => task.id');

		const captured = transform(
			`function Board(this: Component<{ tasks: { id: string }[] }>) {
      let seen = 0;
      const tasks = this.state.tasks.filter(task => { seen++; return !!task.id; });
      return () => this.map(tasks, task => task.id, task => <li>{task.id}</li>);
    }`,
			{ filename: 'Board.tsx' }
		);
		expect(captured).toContain('this.map(tasks, task => task.id');
		expect(captured).not.toContain('this.map(this.reactive(() => this.state.tasks.filter');
	});

	it('keeps filter/reduce locals reactive in JSX while allowing accumulator mutation', () => {
		const output = transform(
			`function Totals(this: Component<{ items: { index: number; val: number }[] }>) {
      const count = this.state.items.filter(i => i.index % 2).reduce((agg, i) => { agg += i.val; return agg; }, 0);
      return () => <p>{count}</p>;
    }`,
			{ filename: 'Totals.tsx' }
		);
		expect(output).toContain('const count = __exactDerived(() => this.state.items.filter');
		expect(output).toContain('__exactDynamic(() => count.get())');
		expect(output).toContain('reduce((agg, i) => { agg += i.val; return agg; }, 0))');
	});
});
