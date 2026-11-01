import { unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import {
	mountSubmitLifetime,
	submitOwner,
	submitButton,
	submitErrors,
	type SubmitLifetimeProps
} from './submit-lifetime.fixtures.js';

function gate<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function settle() {
	for (let index = 0; index < 16; index++) await Promise.resolve();
	flushSync();
}

function requireContract(value: unknown, message: string): void {
	if (!value) throw new Error(message);
}

/**
 * Checks admission after each asynchronous Form boundary, using real native submit events.
 * Already-started callbacks may finish. Disposal releases refs, leaves detached submit events unhandled and prevents new stages.
 */
export async function verifySubmitLifetime() {
	const host = document.createElement('div');
	document.body.append(host);
	const reports: unknown[] = [];
	const options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
	let valid = 0,
		invalid = 0,
		raw = 0;
	let previousErrors: typeof submitErrors;
	const mount = (props: SubmitLifetimeProps) => {
		requireContract(!previousErrors?.errors.length, 'Unexpected earlier component report');
		mountSubmitLifetime(host, props, options);
		previousErrors = submitErrors;
		flushSync();
		const form = host.querySelector('form')!;
		requireContract(form, 'Missing native form');
		return form;
	};
	const submit = (form: HTMLFormElement) => {
		const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
		form.dispatchEvent(event);
		return event;
	};
	try {
		for (const result of [true, 'invalid'] as const) {
			const validation = gate<boolean | string>();
			let signal: AbortSignal | undefined;
			const form = mount({
				errors: result === 'invalid' ? { entry: 'existing invalid' } : undefined,
				validate: (_value, context) => {
					signal = context.signal;
					return validation.promise;
				},
				valid: () => {
					valid++;
				},
				invalid: () => {
					invalid++;
				}
			});
			const owner = submitOwner!;
			const button = form.querySelector('button');
			requireContract(button !== null, 'Missing native submit button');
			requireContract(
				owner.refs.get(submitButton) === button,
				'Native submit ref did not match button'
			);
			const liveSubmit = submit(form);
			requireContract(liveSubmit.defaultPrevented, 'Live submit event was not handled');
			await settle();
			requireContract(
				form.getAttribute('aria-busy') === 'true',
				'Validation must expose pending state'
			);
			requireContract(
				owner.refs.get(submitButton) === button,
				'Pending changed native ref identity'
			);
			unmount(host);
			requireContract(signal?.aborted, 'Field validation signal was not aborted');
			requireContract(owner.refs.get(submitButton) === undefined, 'Disposed ref retained');
			validation.resolve(result);
			await settle();
			requireContract(
				valid === 0 && invalid === 0,
				'Disposed validation started a submit callback'
			);
			const detachedSubmit = submit(form);
			await settle();
			requireContract(!detachedSubmit.defaultPrevented, 'Detached submit event was handled');
			requireContract(valid === 0 && invalid === 0, 'Detached submit started a callback');
		}
		const beforeValidation = gate<void>();
		let validations = 0;
		const rawForm = mount({
			raw: () => {
				raw++;
				return beforeValidation.promise;
			},
			validate: () => {
				validations++;
				return true;
			},
			valid: () => {
				valid++;
			}
		});
		submit(rawForm);
		await settle();
		unmount(host);
		beforeValidation.resolve();
		await settle();
		requireContract(
			raw === 1 && validations === 0 && valid === 0,
			'Disposed raw callback started validation'
		);

		const running = gate<void>();
		let finished = 0;
		const runningForm = mount({
			valid: async () => {
				valid++;
				await running.promise;
				finished++;
			}
		});
		submit(runningForm);
		await settle();
		requireContract(valid === 1, 'Valid callback never started');
		unmount(host);
		running.resolve();
		await settle();
		requireContract(finished === 1, 'Already-started callback was cancelled');

		const cancelledForm = mount({
			raw: (event) => {
				event.preventDefault();
			},
			valid: () => {
				valid++;
			}
		});
		submit(cancelledForm);
		await settle();
		requireContract(valid === 1, 'Synchronous cancellation order changed');
		unmount(host);

		let attempts = 0;
		const next = mount({
			valid: () => {
				if (++attempts === 1) throw new Error('expected form rejection');
				valid++;
			}
		});
		submit(next);
		await settle();
		requireContract(
			submitErrors?.errors.length === 1 &&
				String(submitErrors.errors[0]!.error).includes('expected form rejection'),
			'Submission rejection not reported exactly once'
		);
		requireContract(!next.hasAttribute('aria-busy'), 'Rejected submission retained pending state');
		submit(next);
		await settle();
		requireContract(
			attempts === 2 && valid === 2,
			JSON.stringify({
				message: 'Following submission failed to progress',
				attempts,
				valid,
				html: host.innerHTML,
				reports: reports.map(String)
			})
		);
		unmount(host);
		requireContract(host.childNodes.length === 0, 'Disposed form left native nodes');
		return {
			disposedValidation: true,
			disposedRaw: true,
			alreadyStarted: true,
			cancelled: true,
			progress: true,
			refsReleased: true,
			detachedHandlerInactive: true,
			expectedRejections: 1,
			unexpectedReports: [...reports, ...submitErrors!.errors.slice(1)].map(String)
		};
	} finally {
		unmount(host);
		host.remove();
	}
}
