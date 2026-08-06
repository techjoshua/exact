# @exactjs/forms

Accessible form components for eXact applications.

## Usage

```tsx
<Form errors={this.state.errors} onValidSubmit={save}>
	<Field name="email">
		<Label>Email</Label>
		<Input type="email" />
		<FieldError />
	</Field>
	<Submit pendingText="Saving…">Save</Submit>
</Form>
```

## Components

The package provides `Form`, `Field`, `Label`, `Input`, `Textarea`, `Select`,
`Checkbox`, help text, validation feedback, and coordinated submit controls.

Keep application values and server validation errors in component state. Form context supplies
accessible relationships and validation coordination without introducing a second data store.
Submission pending state includes validation and async work started by the callback.

See [actions and forms](../../docs/actions-and-forms.md).
The package publishes inert component build facts for the consuming server bundler's
[component-library policy](../../docs/component-library-trust.md).
