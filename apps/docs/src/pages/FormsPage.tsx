import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const formSource = `import {
  Field,
  FieldError,
  FieldHelp,
  Form,
  Input,
  Label,
  Submit
} from '@exactjs/forms';

<Form errors={this.state.errors} onValidSubmit={(_event, data) => save(data)}>
  <Field
    name="email"
    required
    // A validator returns true or a user-facing error.
    validate={(value) => String(value).includes('@') || 'Enter an email'}
  >
    {/* These components use Field context to configure native elements. */}
    <Label>Email</Label>
    {/* eXact's Input component renders a native <input>. */}
    <Input type="email" />
    <FieldHelp>We only use this for account messages.</FieldHelp>
    <FieldError />
  </Field>
  <Submit pendingText="Saving…">Save</Submit>
</Form>`;

const reactiveInputSource = `function ProfileEditor(this: Component<{
  name: string;
  quantity: number | null;
  subscribed: boolean;
  delivery: 'ground' | 'express';
  carriers: ('ups' | 'usps')[];
  tags: string[];
}>) {
  return () => (
    <form>
      <input value:input={this.state.name} />
      <input type="number" value:change={this.state.quantity} />
      <input type="checkbox" checked:change={this.state.subscribed} />

      <input
        type="radio"
        value="ground"
        checked:change={this.state.delivery}
      />

      <input
        type="checkbox"
        value="ups"
        checked:change={this.state.carriers}
      />

      <select multiple value:change={this.state.tags}>...</select>
    </form>
  );
}`;

const manualInputSource = `// Ordinary controlled input:
<input
  value={this.state.name}
  onInput={(event) => {
    this.state.name = event.currentTarget.value;
  }}
/>

// The same property projection and write-back relationship:
<input value:input={this.state.name} />`;

const bindingEffectsSource = `<input
  value:input={this.state.name}
  onInput={() => {
    // The binding has already updated state.
    this.log.info('Name edited', { name: this.state.name });
  }}
/>`;

const invalidInputBindingsSource = `// A binding needs one writable location, not a derived value.
<input value:input={\`\${this.state.first} \${this.state.last}\`} />

// Checkboxes project their checked property, not their value property.
<input type="checkbox" value:change={this.state.enabled} />

// Select controls commit through change, not input.
<select value:input={this.state.status}>...</select>

// The compiler generates value, so an explicit value would conflict.
<input value={this.state.name} value:input={this.state.name} />

// An array-bound checkbox needs the value it will add or remove.
<input type="checkbox" checked:change={this.state.filters} />`;

/** Documents native element bindings separately from eXact form-library components. */
export function FormsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Reactive inputs and accessible fields"
			description="Connect native controls to component state without repetitive assignment handlers, then compose labels, help, errors, and validation without surrendering ownership of the data."
			previous={{ path: '/guides/routing', label: 'Routing' }}
			next={{ path: '/guides/testing', label: 'Testing' }}
		>
			<section>
				<h2>Start with native DOM controls</h2>
				<p>
					The lowercase <code>{'<input>'}</code>, <code>{'<textarea>'}</code>, and{' '}
					<code>{'<select>'}</code> elements in the following sections are ordinary browser
					elements, not eXact components. A controlled input normally repeats the same state path
					twice: once to project state into a DOM property and once to copy the browser's next value
					back during an event. eXact supports a narrow
					<code>property:event</code> notation for that recurring relationship.
				</p>
				<CodeBlock source={manualInputSource} language="tsx" title="Equivalent input code" />
				<p>
					The compiler still emits a reactive <code>value</code> or <code>checked</code> property
					and a lifecycle-owned native listener. The notation removes mechanical code; it does not
					introduce a general directive or event system.
				</p>
			</section>
			<section>
				<h2>The supported forms are deliberately small</h2>
				<CodeBlock source={reactiveInputSource} language="tsx" title="ProfileEditor.tsx" />
				<div className="table-scroll">
					<table>
						<thead>
							<tr>
								<th>Notation</th>
								<th>Controls</th>
								<th>State</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>
									<code>value:input</code>
								</td>
								<td>Input and textarea</td>
								<td>String, number, date, or nullable variants</td>
							</tr>
							<tr>
								<td>
									<code>value:change</code>
								</td>
								<td>Input, textarea, select, and multi-select</td>
								<td>Scalar values or a string/number array for multi-select</td>
							</tr>
							<tr>
								<td>
									<code>checked:change</code>
								</td>
								<td>Checkbox and radio input</td>
								<td>Boolean, radio value, or string/number checkbox array</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					The bound type selects the browser conversion. Numbers use the numeric control value,
					dates use the date value, nullable fields return their declared empty value, radio buttons
					compare their declared
					<code>value</code>, and grouped checkboxes add or remove that value from the array.
				</p>
			</section>
			<section>
				<h2>Authored handlers still handle authored behavior</h2>
				<CodeBlock source={bindingEffectsSource} language="tsx" title="InputWithAudit.tsx" />
				<p>
					A separate <code>onInput</code> or <code>onChange</code> handler may validate, log,
					persist, or coordinate other state. The direct binding listener runs first, so the
					authored handler reads the updated value. Both listeners are removed when the element is
					removed.
				</p>
			</section>
			<section>
				<h2>Compiler errors keep the shorthand honest</h2>
				<CodeBlock source={invalidInputBindingsSource} language="tsx" title="InvalidBindings.tsx" />
				<p>
					A binding must identify exactly one writable property or element access. The compiler
					rejects derived expressions, the wrong DOM property or event for a control, conflicting
					explicit
					<code>value</code> or <code>checked</code> props, checkbox arrays without an option value,
					unsupported state types, and a union containing both <code>null</code> and{' '}
					<code>undefined</code>
					where the empty representation would be ambiguous.
				</p>
			</section>
			<section>
				<h2>Add accessible field composition with @exactjs/forms</h2>
				<p>
					This is the point where the page switches from native JSX elements to components from{' '}
					<code>@exactjs/forms</code>. Capitalized <code>{'<Form>'}</code>, <code>{'<Field>'}</code>
					, <code>{'<Label>'}</code>, and <code>{'<Input>'}</code> are eXact components. In
					particular, <code>{'<Input>'}</code> is not JSX spelling for a DOM input: it renders a
					native <code>{'<input>'}</code> and uses field context to supply its accessible
					relationships and validation behavior.
				</p>
				<CodeBlock source={formSource} language="tsx" title="AccountForm.tsx" />
				<p>
					Fields validate on first blur and submit, then revalidate invalid values on input.
					Callback validators may be asynchronous; stale results are ignored.
				</p>
			</section>
			<section>
				<h2>Composition preserves native behavior</h2>
				<p>
					Although the capitalized names are eXact components, they render native form elements:
					<code>{'<Label>'}</code> renders <code>{'<label>'}</code>, <code>{'<Input>'}</code>{' '}
					renders <code>{'<input>'}</code>, and <code>{'<Form>'}</code> renders{' '}
					<code>{'<form>'}</code>. The browser still participates in validation. Form context
					coordinates IDs, names, descriptions, errors, and events rather than replacing native
					behavior with a proprietary field model.
				</p>
			</section>
			<section>
				<h2>Submission coordinates the complete interaction</h2>
				<p>
					<code>{'<Form>'}</code> drops duplicate submissions while one is active. Its{' '}
					<code>aria-busy</code> state and the <code>{'<Submit>'}</code> pending label and disabled
					state remain active until validation, the submission callback, placed server work, and
					router operations started by that callback settle.
				</p>
				<p>
					The <code>errors</code> prop projects application-owned server validation messages into
					matching fields. Clearing or replacing those errors remains a normal direct state
					mutation; the form library does not hide another application-data store behind its
					context.
				</p>
			</section>
		</Article>
	);
}
