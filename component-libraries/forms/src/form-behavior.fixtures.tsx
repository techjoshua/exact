import { Input } from './form/controls.js';
import { FieldError, FieldHelp } from './form/feedback.js';
import { Field } from './form/field.js';
import { Form } from './form/form.js';

/** Exercises consumer accessibility attributes and generated help identities. */
export function AccessibleForm() {
	return () => (
		<Form>
			<Field name="email">
				<Input aria-describedby="consumer" aria-invalid="grammar" />
				<FieldHelp>Primary help</FieldHelp>
				<FieldHelp>Secondary help</FieldHelp>
			</Field>
		</Form>
	);
}

/** Exercises asynchronous validation and submission settlement. */
export function AsyncForm(props: { gate: Promise<void>; onSubmit(): void }) {
	return () => (
		<Form onValidSubmit={props.onSubmit}>
			<Field name="name" validate={async () => props.gate}>
				<Input />
			</Field>
			<button type="submit">Save</button>
		</Form>
	);
}

/** Exercises native required-field coordination. */
export function RequiredForm(props: { onSubmit(): void }) {
	return () => (
		<Form onValidSubmit={props.onSubmit}>
			<Field name="name" required>
				<Input />
				<FieldError />
			</Field>
			<button type="submit">Save</button>
		</Form>
	);
}

/** Exercises duplicate generated field identities. */
export function DuplicateForm() {
	return () => (
		<Form>
			<Field name="choice">
				<Input />
			</Field>
			<Field name="choice">
				<Input />
			</Field>
		</Form>
	);
}

/** Exercises explicitly distinct field identities. */
export function DistinctForm() {
	return () => (
		<Form>
			<Field name="choice" id="choice-a">
				<Input />
			</Field>
			<Field name="choice" id="choice-b">
				<Input />
			</Field>
		</Form>
	);
}

/** Exercises application-owned error projection. */
export function FailedForm() {
	return () => (
		<Form errors={{ email: ['Address is unknown', 'Try another'] }}>
			<Field name="email">
				<Input />
				<FieldError />
			</Field>
		</Form>
	);
}
