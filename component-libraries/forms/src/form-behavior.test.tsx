/**
 * @vitest-environment jsdom
 */
import { createErrorContext, ErrorContext } from '@exactjs/core';
import '@exactjs/core/runtime/refs';
import { renderTestTree as render } from '@exactjs/dom/testing';
import { testComponent } from '@exactjs/testing';
import { describe, expect, it, vi } from 'vitest';
import {
	AccessibleForm,
	AsyncForm,
	DistinctForm,
	DuplicateForm,
	FailedForm,
	RequiredForm
} from './form-behavior.fixtures.js';
import { Field, FieldError, Form, Input, Label, Submit } from './index.js';

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
		const view = await testComponent(AsyncForm).props({ gate, onSubmit: submitted }).mount();
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
		const view = await testComponent(RequiredForm).props({ onSubmit: submitted }).mount();
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
		const duplicate = await testComponent(DuplicateForm).context(ErrorContext, errors).mount();
		expect(errors.errors[0]?.error).toEqual(
			expect.objectContaining({ message: expect.stringContaining('explicit distinct ids') })
		);
		expect(duplicate.getAllByRole('textbox')).toHaveLength(1);
		duplicate.unmount();

		const distinct = await testComponent(DistinctForm).mount();
		expect(distinct.getAllByRole('textbox')).toHaveLength(2);
		distinct.unmount();
	});

	it('projects application errors without creating hidden form state', async () => {
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
