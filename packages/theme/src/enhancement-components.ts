import { markExactEnhancementContexts, type Child, type Component } from '@exactjs/core';
import { createCompiledTarget } from '@exactjs/core/runtime/render';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import type { ThemeSurfaceBundle, ThemeTone } from './contracts.js';
import { ThemeSurfaceContext, type ThemeSurfaceEnvironment } from './components.js';

type Size = 'small' | 'medium' | 'large';
type Children = { children?: Child | readonly Child[] };
type InteractionState = { dragging?: boolean };
/** Props selected by the surface activator. */
export type ThemeSurfaceEnhancementProps = Children &
	InteractionState & {
		surface?: true | 'auto' | 'base' | 'raised' | 'floating' | 'sunken' | 'overlay' | 'transparent';
		interactive?: boolean;
	};
/** Props selected by the action activator. */
export type ThemeActionEnhancementProps = Children &
	InteractionState & {
		action?: true | 'primary' | 'secondary' | 'quiet';
		tone?: ThemeTone;
		size?: Size;
	};
/** Props selected by the field activator. */
export type ThemeFieldEnhancementProps = Children & {
	field?: true | 'default' | 'subtle' | 'bare';
	tone?: ThemeTone;
	size?: Size;
};
/** Props selected by the text activator. */
export type ThemeTextEnhancementProps = Children & {
	text?: true | 'body' | 'supporting' | 'muted' | 'heading' | 'display' | 'code';
	tone?: ThemeTone;
};
/** Props selected by the required status activator. */
export type ThemeStatusEnhancementProps = Children & {
	status: Exclude<ThemeTone, 'accent'>;
	size?: Size;
};
/** Props selected by the separator activator. */
export type ThemeSeparatorEnhancementProps = Children & { separator?: true | 'subtle' | 'strong' };
/** Props selected by the selection activator. */
export type ThemeSelectionEnhancementProps = Children &
	InteractionState & {
		selection?: true | 'subtle' | 'strong';
		tone?: ThemeTone;
		size?: Size;
	};

/** Establishes semantic surface aliases and descendant depth. */
export function ThemeSurfaceEnhancement(this: Component<{}>, props: ThemeSurfaceEnhancementProps) {
	const parent = this.hasContext(ThemeSurfaceContext)
		? this.getContext(ThemeSurfaceContext)
		: undefined;
	const environment: ThemeSurfaceEnvironment = Object.freeze({
		get bundle() {
			return surfaceBundle(parent?.bundle ?? 0, props.surface);
		}
	});
	this.setContext(ThemeSurfaceContext, environment);
	return () => {
		const bundle = environment.bundle,
			variant = props.surface === true || props.surface === undefined ? 'auto' : props.surface;
		return createCompiledTarget(
			{
				className: 'exact-theme-surface',
				'data-exact-theme-role': 'surface',
				'data-exact-theme-variant': variant,
				'data-exact-theme-surface': String(bundle),
				...(props.interactive || props.dragging ? { 'data-exact-theme-interactive': 'true' } : {}),
				...(props.dragging ? { 'data-exact-theme-dragging': 'true' } : {}),
				style: surfaceAliases(bundle, variant === 'transparent')
			},
			props.children
		);
	};
}

/** Styles an existing action target without replacing its behavior. */
export function ThemeActionEnhancement(this: Component<{}>, props: ThemeActionEnhancementProps) {
	return () =>
		roleTarget(
			'action',
			props.action === true || props.action === undefined ? 'secondary' : props.action,
			props,
			props.children
		);
}
/** Styles an existing native field without replacing its behavior. */
export function ThemeFieldEnhancement(this: Component<{}>, props: ThemeFieldEnhancementProps) {
	return () =>
		roleTarget(
			'field',
			props.field === true || props.field === undefined ? 'default' : props.field,
			props,
			props.children
		);
}
/** Applies a semantic foreground and typography role. */
export function ThemeTextEnhancement(this: Component<{}>, props: ThemeTextEnhancementProps) {
	return () =>
		roleTarget(
			'text',
			props.text === true || props.text === undefined ? 'body' : props.text,
			props,
			props.children
		);
}
/** Applies a required compact semantic status tone. */
export function ThemeStatusEnhancement(this: Component<{}>, props: ThemeStatusEnhancementProps) {
	return () => roleTarget('status', props.status, { ...props, tone: props.status }, props.children);
}
/** Styles an existing semantic or decorative separator. */
export function ThemeSeparatorEnhancement(
	this: Component<{}>,
	props: ThemeSeparatorEnhancementProps
) {
	return () =>
		roleTarget(
			'separator',
			props.separator === true || props.separator === undefined ? 'subtle' : props.separator,
			{},
			props.children
		);
}
/** Styles native or ARIA selection state on an existing target. */
export function ThemeSelectionEnhancement(
	this: Component<{}>,
	props: ThemeSelectionEnhancementProps
) {
	return () =>
		roleTarget(
			'selection',
			props.selection === true || props.selection === undefined ? 'subtle' : props.selection,
			props,
			props.children
		);
}

function roleTarget(
	role: string,
	variant: string,
	props: { tone?: ThemeTone; size?: Size; dragging?: boolean },
	children: Children['children']
) {
	return createCompiledTarget(
		{
			className: `exact-theme-${role}`,
			'data-exact-theme-role': role,
			'data-exact-theme-variant': variant,
			...(props.tone ? { 'data-exact-theme-tone': props.tone } : {}),
			...(props.size ? { 'data-exact-theme-size': props.size } : {}),
			...(props.dragging ? { 'data-exact-theme-dragging': 'true' } : {})
		},
		children
	);
}
function surfaceBundle(
	parent: ThemeSurfaceBundle,
	value: ThemeSurfaceEnhancementProps['surface']
): ThemeSurfaceBundle {
	if (value === 'base') return 0;
	if (value === 'sunken' || value === 'overlay') return value;
	if (value === 'transparent') return parent;
	const numeric = typeof parent === 'number' ? parent : 0;
	return Math.min(3, numeric + (value === 'floating' ? 2 : 1)) as 0 | 1 | 2 | 3;
}
function surfaceAliases(bundle: ThemeSurfaceBundle, transparent: boolean): string {
	const prefix = `var(--exact-theme-surface-${bundle}-`;
	return [
		`--exact-theme-surface-background:${transparent ? 'transparent' : `${prefix}background)`}`,
		`--exact-theme-surface-foreground:${prefix}foreground)`,
		`--exact-theme-surface-foreground-muted:${prefix}foreground-muted)`,
		`--exact-theme-surface-border:${prefix}border)`,
		`--exact-theme-surface-border-strong:${prefix}border-strong)`,
		`--exact-theme-surface-shadow:${transparent ? 'none' : `${prefix}shadow)`}`
	].join(';');
}

markExactComponent(ThemeSurfaceEnhancement, '@exactjs/theme:Surface');
markExactComponent(ThemeActionEnhancement, '@exactjs/theme:Action');
markExactComponent(ThemeFieldEnhancement, '@exactjs/theme:Field');
markExactComponent(ThemeTextEnhancement, '@exactjs/theme:Text');
markExactComponent(ThemeStatusEnhancement, '@exactjs/theme:Status');
markExactComponent(ThemeSeparatorEnhancement, '@exactjs/theme:Separator');
markExactComponent(ThemeSelectionEnhancement, '@exactjs/theme:Selection');
markExactEnhancementContexts(ThemeSurfaceEnhancement, {
	provides: [ThemeSurfaceContext],
	optionallyConsumes: [ThemeSurfaceContext]
});
