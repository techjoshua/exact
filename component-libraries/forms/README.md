# @exactjs/forms

Accessible form composition for eXact applications. The package provides `Form`, `Field`,
`Input`, `Textarea`, `Select`, `Checkbox`, `Label`, help text, validation feedback, and submission
coordination without introducing a second state model.

```tsx
<Form errors={this.state.errors} onValidSubmit={save}>
	<Field name="email">
		<Label>Email</Label>
		<Input type="email" value:input={this.state.email} />
		<FieldError />
	</Field>
	<Submit pendingText="Saving…">Save</Submit>
</Form>
```

Keep mutable values in component state and use eXact's `value:input`, `value:change`, and
`checked:change` bindings where appropriate. Form context owns accessibility and validation
relationships; application state remains directly inspectable.

The library components follow the native render contract: props, accessibility
IDs, and validation projections are prepared during setup, while each returned
render function contains only its JSX view expression.

Submission is an interaction host. Duplicate submissions are dropped while one is active,
`aria-busy` and submit disabled state follow the full joined settlement, and router work started
by the callback remains part of that lifetime. The `errors` prop projects application-owned
server validation state into matching fields; it does not create a hidden form error store.

See [Task interactions, optimistic state, and forms](../../docs/actions-and-forms.md).
