import { type ComponentFunction, type ContextToken } from '@exactjs/core';

import type { AccessibleName } from '../contracts.js';
import { TestComponent } from '../mounting/views.js';
import { matchesName } from '../queries/accessibility.js';
import { TestElement } from '../queries/host.js';

/** Describes the result produced by matcher. */
export type MatcherResult = { pass: boolean; message(): string };
/** Defines the exact matcher declarations interface contract. */
export interface ExactMatcherDeclarations<R = void> {
	toBeMounted(): R;
	toHaveState(expected: object): R;
	toHaveProps(expected: object): R;
	toHaveContext(token: ContextToken<unknown>, expected: unknown): R;
	toContainComponent(type: ComponentFunction<any, any>): R;
	toHaveText(expected: AccessibleName): R;
	toHaveAttribute(name: string, expected?: string): R;
	toHaveValue(expected: unknown): R;
	toBeChecked(): R;
	toBeDisabled(): R;
	toHaveFocus(): R;
}
/** Defines the expect like type contract. */
export type ExpectLike = {
	extend(
		matchers: Record<string, (received: unknown, ...expected: unknown[]) => MatcherResult>
	): void;
};
const result = (pass: boolean, positive: string, negative: string): MatcherResult => ({
	pass,
	message: () => (pass ? negative : positive)
});
const componentValue = (value: unknown): TestComponent<any, any> | undefined =>
	value instanceof TestComponent ? value : undefined;
const elementValue = (value: unknown): Element | undefined =>
	value instanceof TestElement
		? value.element
		: !!value && typeof value === 'object' && (value as Node).nodeType === 1
			? (value as Element)
			: undefined;

/** Provides the canonical exact matchers value. */
export const exactMatchers = {
	toBeMounted(received: unknown) {
		const pass =
			componentValue(received)?.isMounted() ??
			(received instanceof TestElement
				? (received.owner()?.isMounted() ?? !!received.element.parentNode)
				: !!elementValue(received)?.isConnected);
		return result(pass, 'Expected value to be mounted', 'Expected value not to be mounted');
	},
	toHaveState(received: unknown, expected: object) {
		const actual = componentValue(received)?.state();
		const pass = !!actual && subset(actual, expected);
		return result(
			pass,
			`Expected component state to contain ${JSON.stringify(expected)}`,
			'Expected component state not to match'
		);
	},
	toHaveProps(received: unknown, expected: object) {
		const actual = componentValue(received)?.props();
		const pass = !!actual && subset(actual as object, expected);
		return result(
			pass,
			`Expected component props to contain ${JSON.stringify(expected)}`,
			'Expected component props not to match'
		);
	},
	toHaveContext(received: unknown, token: ContextToken<unknown>, expected: unknown) {
		let actual: unknown;
		try {
			actual = componentValue(received)?.context(token);
		} catch {}
		const pass = Object.is(actual, expected);
		return result(
			pass,
			`Expected context ${token.description} to match`,
			`Expected context ${token.description} not to match`
		);
	},
	toContainComponent(received: unknown, type: ComponentFunction<any, any>) {
		const pass = (componentValue(received)?.findAll(type).length ?? 0) > 0;
		return result(
			pass,
			`Expected component to contain ${type.name}`,
			`Expected component not to contain ${type.name}`
		);
	},
	toHaveText(received: unknown, expected: AccessibleName) {
		const actual =
			elementValue(received)?.textContent?.trim() ??
			componentValue(received)
				?.elements()
				.map((value) => value.textContent)
				.join(' ')
				.trim();
		const pass = matchesName(actual, expected);
		return result(
			pass,
			`Expected text ${String(expected)}, received ${actual}`,
			`Expected text not to match ${String(expected)}`
		);
	},
	toHaveAttribute(received: unknown, name: string, expected?: string) {
		const element = elementValue(received);
		const pass =
			!!element?.hasAttribute(name) &&
			(expected === undefined || element.getAttribute(name) === expected);
		return result(
			pass,
			`Expected attribute ${name}${expected === undefined ? '' : `=${expected}`}`,
			`Expected attribute ${name} not to match`
		);
	},
	toHaveValue(received: unknown, expected: unknown) {
		const pass = Object.is(
			(elementValue(received) as HTMLInputElement | undefined)?.value,
			expected
		);
		return result(
			pass,
			`Expected value ${String(expected)}`,
			`Expected value not to be ${String(expected)}`
		);
	},
	toBeChecked(received: unknown) {
		const pass = Boolean((elementValue(received) as HTMLInputElement | undefined)?.checked);
		return result(pass, 'Expected element to be checked', 'Expected element not to be checked');
	},
	toBeDisabled(received: unknown) {
		const pass = Boolean((elementValue(received) as HTMLButtonElement | undefined)?.disabled);
		return result(pass, 'Expected element to be disabled', 'Expected element not to be disabled');
	},
	toHaveFocus(received: unknown) {
		const element = elementValue(received);
		const pass = !!element && element.ownerDocument.activeElement === element;
		return result(pass, 'Expected element to have focus', 'Expected element not to have focus');
	}
};

/** Performs the install exact matchers domain operation. */
export function installExactMatchers(expect: ExpectLike): void {
	expect.extend(
		exactMatchers as unknown as Record<
			string,
			(received: unknown, ...expected: unknown[]) => MatcherResult
		>
	);
}
function subset(actual: object, expected: object): boolean {
	return Object.entries(expected).every(([key, value]) =>
		Object.is((actual as Record<string, unknown>)[key], value)
	);
}
