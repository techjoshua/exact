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
  advanced: boolean;
}>) {
  return () => (
    <form>
      <input value:onInput={this.state.name} />
      <input type="number" value:onChange={this.state.quantity} />
      <input type="checkbox" checked:onChange={this.state.subscribed} />

      <input
        type="radio"
        value="ground"
        checked:onChange={this.state.delivery}
      />

      <input
        type="checkbox"
        value="ups"
        checked:onChange={this.state.carriers}
      />

      <select multiple value:onChange={this.state.tags}>...</select>
      <details open:onToggle={this.state.advanced}>Advanced settings</details>
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
<input value:onInput={this.state.name} />`;

const bindingEffectsSource = `<input
  value:onInput={this.state.name}
  onInput={() => {
    // The binding has already updated state.
    this.log.info('Name edited', { name: this.state.name });
  }}
/>`;

const componentBindingSource = `type SettingsPanelProps = {
  expanded: boolean;
  onExpandedChanged?(expanded: boolean, reason?: string): void;
};

// eXact shorthand for an ordinary value prop plus an assignment callback prop.
<SettingsPanel expanded:onExpandedChanged={this.state.settingsExpanded} />

// Write the full form when notification does more than assign.
<SettingsPanel
  expanded={this.state.settingsExpanded}
  onExpandedChanged={(expanded, reason) => {
    this.log.info('panel changed', { expanded, reason });
    this.state.settingsExpanded = expanded;
  }}
/>`;

const invalidInputBindingsSource = `// A binding needs one writable location, not a derived value.
<input value:onInput={\`\${this.state.first} \${this.state.last}\`} />

// Checkboxes project their checked property, not their value property.
<input type="checkbox" value:onChange={this.state.enabled} />

// Select controls commit through change, not input.
<select value:onInput={this.state.status}>...</select>

// The compiler generates value, so an explicit value would conflict.
<input value={this.state.name} value:onInput={this.state.name} />

// An array-bound checkbox needs the value it will add or remove.
<input type="checkbox" checked:onChange={this.state.filters} />`;

/** Documents native element bindings separately from eXact form-library components. */
export function FormsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Reactive, accessible forms"
			description="Connect form controls to state, label fields, and handle validation and submission."
			previous={{ path: '/guides/routing', label: 'Routing' }}
			next={{ path: '/guides/testing', label: 'Testing' }}
		>
			<section>
				<h2>Start with native DOM controls</h2>
				<p>
					Use <code>value:onInput</code> to keep an input and a state field in sync while the user
					types. The left side names the input property; the right side names the browser event that
					writes its new value back to state. The examples use native HTML controls.
				</p>
				<CodeBlock source={manualInputSource} language="tsx" title="Equivalent input code" />
				<p>
					Changing the state also updates the control. Use an ordinary event callback when an edit
					needs validation or transformation before it is accepted.
				</p>
			</section>
			<section>
				<h2>Bind a component’s value and change callback</h2>
				<CodeBlock
					source={componentBindingSource}
					language="tsx"
					title="SettingsPanelBinding.tsx"
				/>
				<p>
					The same syntax can connect a child component’s value prop and change callback. Both names
					must be declared props. The callback’s first argument becomes the new value in the
					parent’s state. Run <code>exactc --check</code> to check this compiler-supported TSX
					syntax.
				</p>
				<p>
					Use explicit props when the callback validates, transforms, refuses, logs, awaits, or
					returns a result. Supplying either generated prop alongside the shorthand is an error;
					component callbacks are not composed.
				</p>
				<p>
					A namespaced attribute that also resolves as an imported enhancement is an error. Expand
					the two component props or rename the enhancement namespace; casing never silently chooses
					one meaning.
				</p>
			</section>
			<section>
				<h2>Choose a binding for each control</h2>
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
									<code>value:onInput</code>
								</td>
								<td>Input and textarea</td>
								<td>String, number, date, or nullable variants</td>
							</tr>
							<tr>
								<td>
									<code>value:onChange</code>
								</td>
								<td>Input, textarea, select, and multi-select</td>
								<td>Scalar values or a string/number array for multi-select</td>
							</tr>
							<tr>
								<td>
									<code>checked:onChange</code>
								</td>
								<td>Checkbox and radio input</td>
								<td>Boolean, radio value, or string/number checkbox array</td>
							</tr>
							<tr>
								<td>
									<code>open:onToggle</code>
								</td>
								<td>Details disclosure</td>
								<td>Boolean open state</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					The bound type selects the browser conversion. Numbers use the numeric control value,
					dates use the date value, nullable fields return their declared empty value, radio buttons
					compare their declared
					<code>value</code>, and grouped checkboxes add or remove that value from the array.
					Controlled selects apply their value after option values are mounted, including inside
					compiler-planned static regions, so their initial selection is never lost. Server output
					marks the matching options too, allowing hydration to preserve a selection only when the
					user changed it before activation.
				</p>
			</section>
			<section>
				<h2>Add an event handler to a bound control</h2>
				<CodeBlock source={bindingEffectsSource} language="tsx" title="InputWithAudit.tsx" />
				<p>
					A separate <code>onInput</code>, <code>onChange</code>, or <code>onToggle</code> handler
					may validate, log, persist, or coordinate other state. The direct binding listener runs
					first, so the authored handler reads the updated value. Both listeners are removed when
					the element is removed.
				</p>
				<p>
					A bound <code>{'<details>'}</code> reads its final <code>open</code> property on each
					<code>toggle</code>, including browser changes within a named exclusive group. Hydration
					preserves and publishes a disclosure changed before the app starts. Bindings otherwise
					observe only their declared endpoint: eXact does not poll controls or synthesize events
					for reset, autofill, restoration, or silent platform mutations.
				</p>
			</section>
			<section>
				<h2>Fix invalid bindings</h2>
				<CodeBlock source={invalidInputBindingsSource} language="tsx" title="InvalidBindings.tsx" />
				<p>
					A binding must identify exactly one writable property or element access. The compiler
					rejects derived expressions, the wrong DOM property or event for a control, conflicting
					explicit
					<code>value</code> or <code>checked</code> props, checkbox arrays without an option value,
					unsupported state types, and a union containing both <code>null</code> and
					<code>undefined</code>
					where the empty representation would be ambiguous.
				</p>
			</section>
			<section>
				<h2>Add accessible field composition with @exactjs/forms</h2>
				<p>
					This is the point where the page switches from native JSX elements to components from
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
				<h2>Use native form behavior</h2>
				<p>
					Although the capitalized names are eXact components, they render native form elements:
					<code>{'<Label>'}</code> renders <code>{'<label>'}</code>, <code>{'<Input>'}</code>
					renders <code>{'<input>'}</code>, and <code>{'<Form>'}</code> renders
					<code>{'<form>'}</code>. The browser still participates in validation. Form context
					coordinates IDs, names, descriptions, errors, and events rather than replacing native
					behavior with a proprietary field model.
				</p>
			</section>
			<section>
				<h2>Show pending state during submission</h2>
				<p>
					<code>{'<Form>'}</code> drops duplicate submissions while one is active. Its
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
