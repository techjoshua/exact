# @exactjs/forms

Accessible form composition for eXact applications. The package provides `Form`, `Field`,
`Input`, `Textarea`, `Select`, `Checkbox`, `Label`, help text, validation feedback, and submission
coordination without introducing a second state model.

```tsx
<Form onSubmit={() => save(this.state)}>
	<Field name="email">
		<Label>Email</Label>
		<Input type="email" value:input={this.state.email} />
	</Field>
</Form>
```

Keep mutable values in component state and use eXact's `value:input`, `value:change`, and
`checked:change` bindings where appropriate. Form context owns accessibility and validation
relationships; application state remains directly inspectable.
