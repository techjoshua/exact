import { expect, it } from 'vitest';
import { createElement, memo, forwardRef, lazy } from './index.js';

it('accepts wrapper components without authored props and retains required prop inference', () => {
	const Empty = memo(() => 'empty');
	const Forwarded = forwardRef(() => 'forwarded');
	const Lazy = lazy(async () => ({ default: () => 'lazy' }));
	expect(createElement(Empty).type).toBe(Empty);
	expect(createElement(Forwarded).type).toBe(Forwarded);
	expect(createElement(Lazy).type).toBe(Lazy);
	const Label = memo(
		(props: { label: string }) => props.label,
		(before, after) => before.label === after.label
	);
	expect(createElement(Label, { label: 'valid' }).props.label).toBe('valid');
	// Required authored props remain checked when a wrapper supplies a default for no-props functions.
	// @ts-expect-error A numeric label violates the inferred authored contract.
	createElement(Label, { label: 1 });
	// @ts-expect-error The required label cannot be omitted from a supplied props object.
	createElement(Label, {});
});
