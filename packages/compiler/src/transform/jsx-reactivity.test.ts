import { describe, expect, it } from 'vitest';
import { transform } from '../index.js';

describe('@exact/compiler: JSX reactivity', () => {
	it('lowers shorthand and underscore fragments', () => {
		const output = transform('const view = <_ key={id}><span /></_>; const next = <>tail</>;');

		expect(output).toContain('__exactFragment({ key: id }');
		expect(output).toContain('__exactVNode("span"');
		expect(output).toContain('__exactFragment({}');
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
