/**
 * @vitest-environment jsdom
 */
import { createErrorContext, ErrorContext } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { testComponent } from '@exactjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { Field, FieldError, FieldHelp, Form, Input, Label, Submit } from './index.js';

describe('forms', () => {
	it('wires accessible fields and validates submission', async () => {
		const submitted = vi.fn();
		const container = document.createElement('div');
		render(
			<Form onValidSubmit={submitted}>
				<Field name="email" validate={(value) => String(value).includes('@') || 'Enter an email'}>
					<Label>Email</Label>
					<Input />
					<FieldError />
				</Field>
			</Form>,
			container
		);
		const input = container.querySelector('input')!;
		const form = container.querySelector('form')!;
		expect(input.id).toBe('exact-field-email');
		expect(container.querySelector('label')!.htmlFor).toBe(input.id);
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() =>
			expect(container.querySelector('[role=alert]')?.textContent).toBe('Enter an email')
		);
		input.value = 'ada@example.test';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await vi.waitFor(() => expect(container.querySelector('[role=alert]')).toBeNull());
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
	});

	it('supports native required validation and described help', async () => {
		const submitted = vi.fn();
		const container = document.createElement('div');
		render(
			<Form onValidSubmit={submitted}>
				<Field name="title" required>
					<Label>Title</Label>
					<Input />
					<span id="outside">Outside</span>
					<FieldError />
				</Field>
			</Form>,
			container
		);
		const input = container.querySelector('input')!;
		container
			.querySelector('form')!
			.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
		expect(submitted).not.toHaveBeenCalled();
	});

	it('merges consumer accessibility attributes and assigns distinct help IDs', async () => {
		function AccessibleForm() {
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
		const view = await testComponent(AccessibleForm).mount();
		const input = view.getByRole('textbox').element;
		expect(input.getAttribute('aria-describedby')).toBe(
			'consumer exact-field-email-help exact-field-email-help-2'
		);
		expect(input.getAttribute('aria-invalid')).toBe('grammar');
		expect(view.getByText('Primary help').attribute('id')).toBe('exact-field-email-help');
		expect(view.getByText('Secondary help').attribute('id')).toBe('exact-field-email-help-2');
		view.unmount();
	});

	it('awaits asynchronous validation and submission through testing actions', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const submitted = vi.fn();
		function AsyncForm() {
			return () => (
				<Form onValidSubmit={submitted}>
					<Field
						name="name"
						validate={async () => {
							await gate;
						}}
					>
						<Input />
					</Field>
					<button type="submit">Save</button>
				</Form>
			);
		}
		const view = await testComponent(AsyncForm).mount();
		let settled = false;
		const action = view
			.getByRole('button', { name: 'Save' })
			.submit()
			.then(() => {
				settled = true;
			});
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await action;
		expect(submitted).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('coordinates native constraints for real requestSubmit actions', async () => {
		const submitted = vi.fn();
		function RequiredForm() {
			return () => (
				<Form onValidSubmit={submitted}>
					<Field name="name" required>
						<Input />
						<FieldError />
					</Field>
					<button type="submit">Save</button>
				</Form>
			);
		}
		const view = await testComponent(RequiredForm).mount();
		const input = view.getByRole('textbox');
		await view.getByRole('button', { name: 'Save' }).submit();
		expect(submitted).not.toHaveBeenCalled();
		expect(input.attribute('aria-invalid')).toBe('true');
		expect(input.focused()).toBe(true);
		expect(view.getByRole('alert').text()).not.toBe('');
		view.unmount();
	});

	it('rejects duplicate generated field IDs while allowing explicit distinct IDs', async () => {
		const errors = createErrorContext();
		function DuplicateForm() {
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
		const duplicate = await testComponent(DuplicateForm).context(ErrorContext, errors).mount();
		expect(errors.errors[0]?.error).toEqual(
			expect.objectContaining({ message: expect.stringContaining('explicit distinct ids') })
		);
		expect(duplicate.getAllByRole('textbox')).toHaveLength(1);
		duplicate.unmount();

		function DistinctForm() {
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
		const distinct = await testComponent(DistinctForm).mount();
		expect(distinct.getAllByRole('textbox')).toHaveLength(2);
		distinct.unmount();
	});

	it('projects application errors without creating hidden form state', async () => {
		function FailedForm() {
			return () => (
				<Form errors={{ email: ['Address is unknown', 'Try another'] }}>
					<Field name="email">
						<Input />
						<FieldError />
					</Field>
				</Form>
			);
		}
		const view = await testComponent(FailedForm).mount();
		expect(view.getByRole('alert').text()).toBe('Address is unknown Try another');
		expect(view.getByRole('textbox').attribute('aria-invalid')).toBe('true');
		view.unmount();
	});

	it('drops duplicate submissions and exposes pending state through Submit', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const submitted = vi.fn(() => gate);
		const container = document.createElement('div');
		render(
			<Form onValidSubmit={submitted}>
				<Submit pendingText="Saving">Save</Submit>
			</Form>,
			container
		);
		const form = container.querySelector('form')!;
		const button = container.querySelector('button')!;
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(button.textContent).toBe('Saving'));
		expect(button.disabled).toBe(true);

		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		expect(submitted).toHaveBeenCalledTimes(1);
		release();
		await vi.waitFor(() => expect(button.textContent).toBe('Save'));
	});
});
