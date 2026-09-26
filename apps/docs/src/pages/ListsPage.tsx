import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { KeyedListDemo } from '../demos/KeyedListDemo.jsx';
import { Article } from './Article.jsx';

const keyedSource = `type Todo = {
  /** @exact key: this field is the item's stable identity. */
  id: string;
  text: string;
};

function TodoList(this: Component<{ todos: Todo[] }>) {
  this.state.todos = [];

  return () => (
    <ul>
      {/* The compiler lowers ordinary map syntax to keyed reconciliation. */}
      {this.state.todos.map((todo) => <li>{todo.text}</li>)}
    </ul>
  );
}`;

const explicitJsxKeySource = `return () => (
  <ul>
    {this.state.todos.map((todo) => (
      <TodoRow key={todo.id} todo={todo} />
    ))}
  </ul>
);`;

const keyedFragmentSource = `import { _ } from '@exactjs/jsx';

return () => (
  <dl>
    {this.state.todos.map((todo) => (
      <_ key={todo.id}>
        <dt>{todo.title}</dt>
        <dd>{todo.notes}</dd>
      </_>
    ))}
  </dl>
);`;

const explicitMapSource = `return () => this.map(
  this.state.todos,
  // Identity is explicit at the rendering boundary.
  (todo) => todo.id,
  (todo) => <TodoRow todo={todo} />
);`;

/** Documents inferred, explicit, and manual keyed-list identity strategies. */
export function ListsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Lists preserve identity"
			description="Render a collection and keep each item attached to the same component as the list changes."
			previous={{ path: '/learn/state', label: 'State & derived values' }}
			next={{ path: '/learn/tasks', label: 'Tasks, dependencies & scheduling' }}
		>
			<section>
				<h2>Why identity matters</h2>
				<p>
					Imagine editing a row when a newly sorted result moves it elsewhere in the list. The text
					you are typing and the focused input should move with that item. If rows are identified
					only by position, those details can end up attached to a different item.
				</p>
				<p>
					Give each item a stable key, such as its record ID. eXact uses it to retain the item’s
					DOM, component state, and running tasks as the list changes. Duplicate keys produce an
					error because they cannot identify which item should keep that state.
				</p>
			</section>
			<section>
				<h2>Declare identity on the data</h2>
				<CodeBlock source={keyedSource} language="tsx" title="TodoList.tsx" />
				<p>
					Keys may be strings or numbers. eXact normalizes them to strings, so numeric
					<code>1</code> and string <code>&quot;1&quot;</code> count as duplicate keys in the same
					list.
				</p>
				<p>
					The framework owns list identity. Duplicate keys fail deterministically rather than
					falling back to position and risking state corruption. String arrays use the string value
					as their key. The annotated item type may be declared in this file or imported from a
					shared model module.
				</p>
			</section>
			<section>
				<h2>Try reordering the Reading Queue</h2>
				<p>
					Expand one reading item, then move the first row to the end. The expanded state follows
					the item identified by its <code>id</code>. It does not remain stuck to the first
					position. The same behavior keeps edits and focus attached to their items in an editable
					list.
				</p>
				<KeyedListDemo />
			</section>
			<section>
				<h2>Choose an explicit fallback when the data cannot be annotated</h2>
				<p>
					Conventional JSX <code>key</code> props are supported. Use one when identity reads most
					naturally on the rendered row. eXact consumes <code>key</code> as framework identity. It
					is not passed to <code>TodoRow</code> as an ordinary prop.
				</p>
				<CodeBlock source={explicitJsxKeySource} language="tsx" title="Explicit JSX key" />
				<p>
					When one keyed item renders several siblings, import eXact&apos;s transparent
					<code>_</code> fragment. The standard <code>&lt;&gt;</code> shorthand cannot receive
					props. <code>_</code> accepts the key, preserves the sibling group as one item, and adds
					no DOM wrapper.
				</p>
				<CodeBlock source={keyedFragmentSource} language="tsx" title="Keyed fragment group" />
				<p>
					Use <code>{'this.map(collection, item => item.id, render)'}</code> when the selector
					belongs next to the view, when the data type cannot carry an <code>@exact key</code>
					annotation, or when you need the distinction between eXact's keyed rendering and native
					<code>Array.map()</code> to be obvious. Automatic keyed lowering is limited to maps that
					produce JSX children, so ordinary data-copy and transformation maps remain native arrays.
				</p>
				<CodeBlock source={explicitMapSource} language="tsx" title="Explicit keyed rendering" />
			</section>
		</Article>
	);
}
