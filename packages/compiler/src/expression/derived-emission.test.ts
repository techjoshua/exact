import { describe, expect, it } from 'vitest';
import { preprocessPropPunning, transform, transformSource } from '../index.js';

describe('@exactjs/compiler: derived values', () => {
	it('shares cached derived consts across reactive JSX children', () => {
		const output = transform(`
      function View(this: Component<{ first: string; last: string }>) {
        const fullName = \`\${this.state.first} \${this.state.last}\`;
        return () => <p>{fullName}</p>;
      }
    `);

		expect(output).toContain(
			'const fullName = __exactDerived(() => `${this.state.first} ${this.state.last}`);'
		);
		expect(output).toContain('__exactDynamic(() => fullName.get())');
	});

	it('inlines safe derived const chains inside reactive JSX props', () => {
		const output = transform(`
      function View(this: Component<{ first: string; last: string }>) {
        const first = this.state.first;
        const fullName = \`\${first} \${this.state.last}\`;
        return () => <p title={fullName}>User</p>;
      }
    `);

		expect(output).toContain('const first = __exactDerived(() => this.state.first);');
		expect(output).toContain(
			'const fullName = __exactDerived(() => `${first.get()} ${this.state.last}`);'
		);
		expect(output).toContain('title: __exactExpression(() => fullName.get())');
	});

	it('inlines safe prop-derived consts inside reactive JSX children', () => {
		const output = transform(`
      function View(props: { user: { first: string; last: string } }) {
        const fullName = \`\${props.user.first} \${props.user.last}\`;
        return () => <p>{fullName}</p>;
      }
    `);

		expect(output).toContain(
			'const fullName = __exactDerived(() => `${props.user.first} ${props.user.last}`);'
		);
		expect(output).toContain('__exactDynamic(() => fullName.get())');
	});

	it('inlines safe destructured prop-derived consts inside reactive JSX props', () => {
		const output = transform(`
      function View({ user }: { user: { first: string; last: string } }) {
        const fullName = \`\${user.first} \${user.last}\`;
        return () => <p title={fullName}>User</p>;
      }
    `);

		expect(output).toContain(
			'const fullName = __exactDerived(() => `${user.first} ${user.last}`);'
		);
		expect(output).toContain('title: __exactExpression(() => fullName.get())');
	});

	it('does not assume an unresolved call in a derived const is environment-neutral', () => {
		expect(() =>
			transform(`
      function View(this: Component<{ first: string }>) {
        const label = format(this.state.first);
        return () => <p>{label}</p>;
      }
    `)
		).toThrow(/opaque call \(View → format\)/);
	});

	it('infers never-reassigned let bindings as const-like derived locals', () => {
		const output = transform(`
      function View(this: Component<{ first: string }>) {
        let label = this.state.first;
        return () => <p>{label}</p>;
      }
    `);

		expect(output).toContain('let label = __exactDerived(() => this.state.first);');
		expect(output).toContain('__exactDynamic(() => label.get())');
	});

	it('rejects derived locals whose initializer writes captured storage', () => {
		expect(() =>
			transform(`
      function View(this: Component<{ first: string }>) {
        let value = "";
        const label = value = this.state.first;
        return () => <p>{label}</p>;
      }
    `)
		).toThrow(/derived local label cannot be safely reevaluated/);
	});

	it('rejects unknown allocation-backed setup locals instead of emitting stale reactive JSX', () => {
		expect(() =>
			transform(`
      function View(this: Component<{ values: string[] }>) {
        class Box { constructor(readonly value: number) {} }
        const value = new Box(this.state.values.length);
        return () => <p>{value.value}</p>;
      }
    `)
		).toThrow(/derived local value cannot be safely reevaluated/);
	});

	it('infers deterministic built-in allocations and static operations', () => {
		const output = transform(`
      function View(props: { values?: string[]; ratio: number }) {
        const values = new Set(props.values ?? []);
        const count = Array.isArray(props.values) ? values.size : 0;
        const progress = Math.round(props.ratio * 100);
        return () => <p>{count}:{progress}</p>;
      }
    `);

		expect(output).toContain('const values = __exactDerived(() => new Set(props.values ?? []));');
		expect(output).toContain('const count = __exactDerived');
		expect(output).toContain('const progress = __exactDerived');
	});

	it('accepts declared pure call contracts while retaining unknown-call diagnostics', () => {
		const output = transform(`
      /** Formats a value without reading or changing external state. @exact pure */
      declare function format(value: string): string;
      function View(props: { name: string }) {
        const label = format(props.name);
        return () => <p>{label}</p>;
      }
    `);

		expect(output).toContain('const label = __exactDerived(() => format(props.name));');
	});

	it('infers pure local helpers and their reactive captures', () => {
		const output = transform(`
      function View(
        this: Component<{ name: string }>,
        props: { suffix: string }
      ) {
        const suffix = (value: string) => value.trim().toUpperCase() + props.suffix;
        const label = suffix(this.state.name);
        return () => <p>{label}</p>;
      }
    `);

		expect(output).toContain('const label = __exactDerived(() => suffix(this.state.name));');
		expect(output).toContain('__exactDynamic(() => label.get())');
		expect(output).not.toContain('const suffix = __exactDerived');
	});

	it('rejects effectful local helpers instead of treating their result as live', () => {
		expect(() =>
			transform(`
      function View(this: Component<{ name: string }>) {
        let calls = 0;
        function format(value: string) {
          calls++;
          return value;
        }
        const label = format(this.state.name);
        return () => <p>{label}</p>;
      }
    `)
		).toThrow(/derived local label cannot be safely reevaluated/);
	});

	it('infers pure function declarations with captured reactive inputs', () => {
		const output = transform(`
      function View(props: { first: string; last: string }) {
        function format() {
          return props.first.trim() + " " + props.last.trim();
        }
        const label = format();
        return () => <p>{label}</p>;
      }
    `);

		expect(output).toContain('const label = __exactDerived(() => format());');
		expect(output).toContain('__exactDynamic(() => label.get())');
	});

	it('rejects reassigned derived bindings instead of retaining a setup snapshot', () => {
		expect(() =>
			transform(`
      function View(this: Component<{ first: string; last: string }>) {
        let label = this.state.first;
        label = this.state.last;
        return () => <p>{label}</p>;
      }
    `)
		).toThrow(/derived local label cannot be safely reevaluated/);
	});

	it('supports additional non-mutating intrinsic collection derivations', () => {
		const output = transform(`
      function View(this: Component<{ values: string[] }>) {
        const first = this.state.values.at(0);
        const position = this.state.values.findIndex(value => value === first);
        const summary = this.state.values.with(0, first ?? "").join(",");
        return () => <p>{position}:{summary}</p>;
      }
    `);

		expect(output).toContain('const first = __exactDerived(() => this.state.values.at(0));');
		expect(output).toContain('const position = __exactDerived');
		expect(output).toContain('const summary = __exactDerived');
	});

	it('inlines safe derived consts inside task dependency captures', () => {
		const output = transform(`
      function View(this: Component<{ query: string }>) {
        const label = \`\${this.state.query}!\`;
        this.task(label, async value => {});
      }
    `);

		expect(output).toContain('const label = __exactDerived(() => `${this.state.query}!`);');
		expect(output).toContain('this.task(label, async (value) => { });');
	});

	it('inlines safe prop-derived consts inside task dependency captures', () => {
		const output = transform(`
      function View(props: { query: string }) {
        const label = \`\${props.query}!\`;
        this.task(label, async value => {});
      }
    `);

		expect(output).toContain('const label = __exactDerived(() => `${props.query}!`);');
		expect(output).toContain('this.task(label, async (value) => { });');
	});

	it('materializes safe derived consts declared inside render functions', () => {
		const output = transform(`
      function View(this: Component<{ first: string; last: string }>) {
        return () => {
          const fullName = \`\${this.state.first} \${this.state.last}\`;
          return <p>{fullName}</p>;
        };
      }
    `);

		expect(output).toContain(
			'const __exact_fullName_1 = `${this.state.first} ${this.state.last}`;'
		);
		expect(output).toContain('return __exact_fullName_1;');
	});

	it('materializes safe derived consts declared inside map render callbacks', () => {
		const output = transform(
			`
      function View(this: Component<{ tasks: { id: string; title: string }[] }>) {
        return () => this.map(this.state.tasks, task => task.id, task => {
          const title = task.title;
          return <li>{title}</li>;
        });
      }
    `,
			{ filename: 'View.tsx' }
		);

		expect(output).toContain('const __exact_title_1 = task.title;');
		expect(output).toContain('return __exact_title_1;');
	});

	it('preserves narrowing for nullable derived locals', () => {
		const output = transform(`
      function View(this: Component<{ enabled: boolean }>) {
        return () => {
          const point = this.state.enabled ? { x: 1 } : undefined;
          return <p title={point ? String(point.x) : "missing"} />;
        };
      }
    `);

		expect(output).toContain(
			'const __exact_point_1 = this.state.enabled ? { x: 1 } : undefined;'
		);
		expect(output).toContain(
			'return __exact_point_1 ? String(__exact_point_1.x) : "missing";'
		);
	});

	it('inlines safe derived consts inside explicit reactive captures', () => {
		const output = transform(`
      function View(this: Component<{ query: string }>) {
        const label = \`\${this.state.query}!\`;
        const reactiveLabel = this.reactive(label);
      }
    `);

		expect(output).toContain('const label = __exactDerived(() => `${this.state.query}!`);');
		expect(output).toContain('this.reactive(() => label.get())');
	});

	it('adds stable compiler ids to this.map list boundaries', () => {
		const output = transform(
			`
      function View(this: Component<{}>) {
        return () => this.map(items, item => item.id, item => <li>{item.title}</li>);
      }
    `,
			{ filename: 'View.tsx' }
		);

		expect(output).toMatch(
			/this\.map\(items, item => item\.id, item => __exactVNode\("li", \{ "data-exact-id": "x[A-Za-z0-9_-]{22}" \}, __exactDynamic\(\(\) => item\.title\)\), "x[A-Za-z0-9_-]{22}", undefined, "member:id"\)/
		);
	});

	it('does not recapture existing reactive lambdas or run-once tasks', () => {
		const output = transform(
			'function View() { this.reactive(() => this.state.query); this.task(({ signal }) => {}); }'
		);

		expect(output).toContain('this.reactive(() => this.state.query)');
		expect(output).toContain('this.task(({ signal }) => { });');
		expect(output).not.toContain('this.reactive(() => () => this.state.query)');
	});

	it('preprocesses Svelte-like prop punning', () => {
		expect(preprocessPropPunning('<UserCard {user} {selected} />')).toBe(
			'<UserCard user={user} selected={selected} />'
		);
	});

	it('does not preprocess puns inside strings or comments', () => {
		const source = [
			'const text = "<UserCard {user} />";',
			'// <UserCard {commented} />',
			'const view = <UserCard {user} label="{raw}" />;'
		].join('\n');

		expect(preprocessPropPunning(source)).toContain('"<UserCard {user} />"');
		expect(preprocessPropPunning(source)).toContain('// <UserCard {commented} />');
		expect(preprocessPropPunning(source)).toContain('<UserCard user={user} label="{raw}" />');
	});

	it('preserves directive prologues before helper imports', () => {
		const output = transform('"use client";\nconst view = <span />;');

		expect(output.trimStart().startsWith('"use client";')).toBe(true);
		expect(output.indexOf('"use client";')).toBeLessThan(output.indexOf('import {'));
	});

	it('avoids helper alias collisions with user identifiers', () => {
		const output = transform('const __exactVNode = 1; const view = <span />;');

		expect(output).toContain('createCompiledVNode as __exactVNode_1');
		expect(output).toContain('__exactVNode_1("span"');
		expect(output).toContain('const __exactVNode = 1');
	});

	it('scans complete JSX expressions before recognizing tag boundaries', () => {
		const source =
			'<View value={{ compare: 2 > 1, text: `${`inner ${3 > 2}`}`, match: (() => { return /[>]/.test(">") })() }} {selected} />';
		const output = preprocessPropPunning(source);
		expect(output).toContain('compare: 2 > 1');
		expect(output).toContain('/[>]/.test');
		expect(output).toContain('selected={selected}');
	});

	it('returns source maps from transformSource when requested', () => {
		const result = transformSource('const view = <span />;', {
			filename: 'view.tsx',
			sourceMap: true
		});

		expect(result.map).toMatchObject({
			version: 3,
			sources: ['view.tsx'],
			sourcesContent: ['const view = <span />;'],
			names: []
		});
		expect(result.map?.mappings).toBeTruthy();
		// The generated helper import has no source location; the first retained
		// token therefore need not map to generated column zero ("AAAA").
		expect(result.map?.mappings.split(';').some((line) => line.length > 0)).toBe(true);
	});
});
