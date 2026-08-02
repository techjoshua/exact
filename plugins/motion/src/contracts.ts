import type { Child, RefBinding } from '@exactjs/core';
import type { FrameworkPublicationRequest } from '@exactjs/core/framework/publication';

declare const preparedMotionDefinition: unique symbol;

/** One finite Web Animations-compatible visual effect. */
export type MotionEffect = Readonly<{
	keyframes: Keyframe[] | PropertyIndexedKeyframes;
	options?: KeyframeAnimationOptions;
}>;

/** Inputs available when a motion phase computes its target-specific effect. */
export type MotionPhaseContext = Readonly<{
	phase: 'enter' | 'change' | 'leave';
	element: Element;
	reducedMotion: boolean;
}>;

/** Static or target-derived finite effect for one lifecycle phase. */
export type MotionPhase =
	| MotionEffect
	| ((context: MotionPhaseContext) => MotionEffect | undefined);

/** Author input accepted by {@link defineMotion}. */
export type MotionDefinitionInput = Readonly<{
	enter?: MotionPhase;
	change?: MotionPhase;
	leave?: MotionPhase;
	reduced?: MotionPhase | 'skip';
}>;

/** Validated immutable reusable motion definition. */
export type MotionDefinition = MotionDefinitionInput &
	Readonly<{ [preparedMotionDefinition]: true }>;

/** Default transition values inherited by effects that omit them. */
export type MotionTransition = Readonly<{
	duration?: number;
	delay?: number;
	easing?: string;
}>;

/** Policy controlling reduced-motion behavior. */
export type MotionReducedPolicy = 'system' | 'always' | 'never';

/** Reactive motion policy inherited through the logical component tree. */
export interface MotionSettings {
	readonly enabled: boolean;
	readonly reducedMotion: MotionReducedPolicy;
	readonly transition: MotionTransition;
	readonly appear: boolean;
}

/** Configuration supplied by one `MotionConfig` boundary. */
export type MotionConfigProps = Readonly<{
	enabled?: boolean;
	reducedMotion?: MotionReducedPolicy;
	transition?: MotionTransition;
	appear?: boolean;
	children?: Child;
}>;

/** Canonical props accepted by the plugin-owned JSX namespace. */
export interface MotionElementProps {
	apply?: MotionDefinition;
	enter?: MotionPhase;
	change?: MotionPhase;
	leave?: MotionPhase;
	appear?: boolean;
	layout?: boolean | 'position' | 'size' | 'both';
	layoutId?: string;
	children?: Child;
}

/** Compilerless intrinsic motion component props. */
export type MotionProps = MotionElementProps &
	Readonly<{
		as: string;
		motion?: MotionDefinition;
		ref?: RefBinding<Element>;
		[key: string]: unknown;
	}>;

/** Explicit conditional presence policy for compilerless callers. */
export type PresenceProps = Readonly<{
	when: boolean;
	children?: Child | readonly Child[];
	returnFocus?: RefBinding<HTMLElement>;
	/** Orders keyed replacement ranges without changing application-owned presence state. */
	mode?: 'sync' | 'out-in' | 'in-out';
}>;

/** Stable keyed collection projection with optional exit layout policy. */
export type MotionListProps<Item> = Readonly<{
	items: Iterable<Item>;
	getKey(item: Item): string;
	children(item: Item): Child;
	exitLayout?: 'retain' | 'pop';
}>;

/** Props for one scoped layout-measurement and shared-identity boundary. */
export type LayoutGroupProps = Readonly<{
	id?: string;
	children?: Child;
}>;

/** Policy for native View Transition publication coordination. */
export type ViewTransitionCoordinatorOptions<Metadata> = Readonly<{
	enabled?: boolean;
	reducedMotion?: MotionReducedPolicy;
	name?(request: FrameworkPublicationRequest<Metadata>): string | undefined;
}>;

/** Cancelable task-frame-owned playback returned by {@link animate}. */
export interface MotionPlayback extends PromiseLike<void> {
	readonly signal: AbortSignal;
	cancel(reason?: unknown): void;
}

/** Environment driver used to execute one resolved finite effect. */
export interface MotionDriver {
	play(element: Element, effect: MotionEffect, signal: AbortSignal): Promise<void>;
}

/** Serializable plugin policy configured at application startup. */
export interface MotionPluginConfig {
	enabled: boolean;
	reducedMotion: MotionReducedPolicy;
	transition: MotionTransition;
	appear: boolean;
}
