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

const explicitMapSource = `return () => this.map(
  this.state.todos,
  // Identity is explicit at the rendering boundary.
  (todo) => todo.id,
  (todo) => <TodoRow todo={todo} />
);`;

export function ListsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Lists keep the identity you give them"
			description="Use ordinary map syntax and mark the field that means identity. Reorders then move the existing item rather than quietly turning it into a different one."
			previous={{ path: '/learn/state', label: 'State & derived values' }}
			next={{ path: '/learn/tasks', label: 'Tasks & cleanup' }}
		>
			<section>
				<h2>Why identity matters</h2>
				<p>
					A list is not simply an array of rendered html. Each row may own input selection, focus,
					local component state, a running task, or a DOM node another system references. If an item
					moves and the renderer identifies rows only by position, that owned state can silently
					attach to the wrong data.
				</p>
				<p>
					eXact asks for stable identity so it can move the existing item boundary instead of
					recreating it or relabeling a neighboring boundary. Duplicate keys fail deterministically
					because guessing would risk state corruption.
				</p>
			</section>
			<KeyedListDemo />
			<section>
				<h2>What the Reading Queue demonstrates</h2>
				<p>
					Expand one reading item, then move the first row to the end. The expanded state follows
					the item identified by its <code>id</code>; it does not remain stuck to the first
					position. That small demo is the visible version of the same guarantee needed by editable
					rows and stateful child components.
				</p>
			</section>
			<section>
				<h2>Declare identity on the data</h2>
				<CodeBlock source={keyedSource} language="tsx" title="TodoList.tsx" />
				<p>
					The framework owns list identity. Duplicate keys fail deterministically rather than
					falling back to position and risking state corruption. String arrays use the string value
					as their key.
				</p>
			</section>
			<section>
				<h2>Choose an explicit fallback when the data cannot be annotated</h2>
				<p>
					Conventional JSX <code>key</code> props are supported. Use one when identity reads most
					naturally on the rendered row. eXact consumes <code>key</code> as framework identity; it
					is not passed to <code>TodoRow</code> as an ordinary prop.
				</p>
				<CodeBlock source={explicitJsxKeySource} language="tsx" title="Explicit JSX key" />
				<p>
					Use <code>{'this.map(collection, item => item.id, render)'}</code> when the selector
					belongs next to the view, when the data type cannot carry an <code>@exact key</code>{' '}
					annotation, or when you need the distinction between eXact's keyed rendering and native{' '}
					<code>Array.map()</code> to be obvious.
				</p>
				<CodeBlock source={explicitMapSource} language="tsx" title="Explicit keyed rendering" />
			</section>
		</Article>
	);
}
