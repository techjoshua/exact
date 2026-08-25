import {
	computed,
	unwrap,
	type EffectScope,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import type { StopHandle } from '@exactjs/core';

/** Defines the css value type contract. */
export type CssValue = string | number | ReactiveValue<string>;

type CssInput = unknown;

/** Provides the canonical px value. */
export const px = unit('px');
/** Provides the canonical rem value. */
export const rem = unit('rem');
/** Provides the canonical em value. */
export const em = unit('em');
/** Provides the canonical percent value. */
export const percent = unit('%');
/** Provides the canonical vh value. */
export const vh = unit('vh');
/** Provides the canonical vw value. */
export const vw = unit('vw');
/** Provides the canonical vmin value. */
export const vmin = unit('vmin');
/** Provides the canonical vmax value. */
export const vmax = unit('vmax');
/** Provides the canonical fr value. */
export const fr = unit('fr');
/** Provides the canonical ms value. */
export const ms = unit('ms');
/** Provides the canonical s value. */
export const s = unit('s');
/** Provides the canonical deg value. */
export const deg = unit('deg');
/** Provides the canonical rad value. */
export const rad = unit('rad');
/** Provides the canonical turn value. */
export const turn = unit('turn');

/** Creates a reactive CSS unit helper such as px(2) or rem(count). */
export function unit(suffix: string): (value: CssInput) => ReactiveValue<string> {
	return (value: CssInput) => computed(() => `${unwrap(value) ?? ''}${suffix}`);
}

/** Converts a camelCase style property name to its CSS property spelling. */
export function toCssProperty(name: string): string {
	return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

/**
 * Applies string or object styles and retains diff state only while reactive dependencies exist.
 *
 * Object-property collections are created on first object output and released when output changes
 * to a string or absent value.
 */
export function bindStyle(
	element: HTMLElement,
	value: unknown,
	scope: EffectScope,
	onRelease: () => void
): StopHandle | undefined {
	let previousNames: Set<string> | undefined;
	let previousCssText: string | undefined;
	let previousValues: Map<string, string> | undefined;
	return watchRetained(
		() => {
			const actual = unwrap(value);

			if (actual === false || actual === null || actual === undefined) {
				if (element.hasAttribute('style')) element.removeAttribute('style');
				previousNames = undefined;
				previousCssText = undefined;
				previousValues = undefined;
				return;
			}

			if (typeof actual === 'string') {
				if (previousCssText !== actual || element.style.cssText !== actual)
					element.style.cssText = actual;
				previousNames = undefined;
				previousCssText = actual;
				previousValues = undefined;
				return;
			}

			if (!actual || typeof actual !== 'object') {
				if (element.hasAttribute('style')) element.removeAttribute('style');
				previousNames = undefined;
				previousCssText = undefined;
				previousValues = undefined;
				return;
			}

			previousCssText = undefined;
			const oldNames = previousNames;
			const oldValues = (previousValues ??= new Map());
			// Track individual property names so removed keys from an object style are
			// cleaned up without wiping unrelated browser-normalized style state.
			const nextNames = new Set<string>();
			for (const [name, rawValue] of Object.entries(actual)) {
				const styleValue = unwrap(rawValue);
				const property = toCssProperty(name);
				nextNames.add(property);
				if (styleValue === null || styleValue === undefined || styleValue === false) {
					if (oldValues.has(property) || element.style.getPropertyValue(property))
						element.style.removeProperty(property);
					oldValues.delete(property);
				} else {
					const nextValue = String(styleValue);
					if (
						oldValues.get(property) !== nextValue ||
						element.style.getPropertyValue(property) !== nextValue
					)
						element.style.setProperty(property, nextValue);
					oldValues.set(property, nextValue);
				}
			}

			for (const name of oldNames ?? []) {
				if (!nextNames.has(name)) {
					element.style.removeProperty(name);
					oldValues.delete(name);
				}
			}
			previousNames = nextNames;
		},
		undefined,
		{ scope, onRelease }
	);
}
