import {
	createComponentRegistry,
	createEnhancementNode,
	createRef,
	type Child,
	type Component,
	type RefBinding,
	type RootLifecycle
} from '@exactjs/core';

export const adoptionEnhancementIdentity = '@exactjs/hydrate:test-enhancement#default';
const adoptionEnhancement = createEnhancementNode([
	{ identity: adoptionEnhancementIdentity, props: {} }
]);

let observeEnhancementRoot: (root: RootLifecycle<HTMLElement>) => void = () => undefined;

/** Enhancement fixture compiled through the native component ABI. */
export function AdoptionEnhancement(this: Component<{}>, props: { children?: Child | Child[] }) {
	observeEnhancementRoot(this.refs.root<HTMLElement>());
	return () => <_target data-enhanced="yes">{props.children}</_target>;
}

function EnhancedPage(this: Component<{}>) {
	return () => <button __exactEnhancements={adoptionEnhancement}>Save</button>;
}

let dynamicPanelInstance: Component<{ active: boolean }> | undefined;
let keyedListInstance: Component<{ items: { id: string; title: string }[] }> | undefined;

function KeyedAdoptionList(this: Component<{ items: { id: string; title: string }[] }>) {
	keyedListInstance = this;
	this.state.items = [
		{ id: 'a', title: 'A' },
		{ id: 'b', title: 'B' }
	];
	return () => (
		<ul>
			{this.map(
				this.state.items,
				(item) => item.id,
				(item) => (
					<li>{item.title}</li>
				),
				'tasks'
			)}
		</ul>
	);
}

function DynamicPanel() {
	return () => <strong>activated</strong>;
}

function DynamicPanelPage(this: Component<{ active: boolean }>) {
	dynamicPanelInstance = this;
	this.state.active = false;
	return () => (
		<div>
			<span>before</span>
			{this.state.active ? <DynamicPanel /> : null}
			<span>after</span>
		</div>
	);
}

function FirstRegistryEntry() {
	return () => <p>first</p>;
}

function SecondRegistryEntry() {
	return () => <p>second</p>;
}

const AdoptionView = createComponentRegistry(() => ({
	first: FirstRegistryEntry,
	second: SecondRegistryEntry
}));

let registrySelection: 'first' | 'second' = 'first';

function RegistryParent() {
	const Current = AdoptionView[registrySelection];
	return () => (
		<>
			<span>stable</span>
			<Current />
		</>
	);
}

function TargetForwardingRoot(this: Component<{}>) {
	return () => (
		<_target className="forwarded" aria-describedby="help">
			<button className="authored">Save</button>
		</_target>
	);
}

type NestedTargetProps = {
	onAuthored(): void;
	onInner(): void;
	onOuter(): void;
	ref: RefBinding<HTMLButtonElement>;
};

let nestedTargetObservers: NestedTargetProps = {
	onAuthored() {},
	onInner() {},
	onOuter() {},
	ref: undefined as never
};

function NestedTargetRoot(this: Component<{}>) {
	return () => (
		<_target
			className="outer"
			ref={nestedTargetObservers.ref}
			onClick={nestedTargetObservers.onOuter}
		>
			<_target
				className="inner"
				ref={nestedTargetObservers.ref}
				onClick={nestedTargetObservers.onInner}
			>
				<button
					className="authored"
					ref={nestedTargetObservers.ref}
					onClick={(event) => {
						nestedTargetObservers.onAuthored();
						event.stopImmediatePropagation();
					}}
				>
					Save
				</button>
			</_target>
		</_target>
	);
}

function InputRoot(this: Component<{}>) {
	return () => <input value="server" />;
}

function BoundInputRoot(this: Component<{}>, props: { publish(value: string): void }) {
	return () => (
		<input
			data-exact-id="name"
			value="server"
			__exactBindInput={(event: Event) =>
				props.publish((event.currentTarget as HTMLInputElement).value)
			}
		/>
	);
}

function DisclosureRoot(this: Component<{}>, props: { publish(value: boolean): void }) {
	return () => (
		<details
			data-exact-id="more"
			open={false}
			__exactBindToggle={(event: Event) =>
				props.publish((event.currentTarget as HTMLDetailsElement).open)
			}
		/>
	);
}

function ParagraphRoot(
	this: Component<{}>,
	props: { className?: unknown; label: string; stale?: boolean }
) {
	return () => (
		<p className={props.className} data-stale={props.stale ? 'yes' : undefined}>
			{props.label}
		</p>
	);
}

function UnsafeIframeRoot(this: Component<{}>, props: { content: unknown }) {
	return () => <iframe srcdoc={props.content} />;
}

function GreetingRoot(this: Component<{}>) {
	return () => <p>hello</p>;
}

function NestedChild(this: Component<{}>) {
	return () => <em>child</em>;
}

function NestedParent(this: Component<{}>) {
	return () => (
		<section>
			<NestedChild />
		</section>
	);
}

function LabelStateRoot(
	this: Component<{ label: string }>,
	props: { capture?(instance: Component<{ label: string }>): void }
) {
	props.capture?.(this);
	this.state.label = 'server';
	return () => <p>{this.state.label}</p>;
}

function LabelPropsRoot(this: Component<{}>, props: { label: string }) {
	return () => <p>{props.label}</p>;
}

function DynamicLabelRoot(
	this: Component<{ label: string }>,
	props: { capture?(instance: Component<{ label: string }>): void }
) {
	props.capture?.(this);
	this.state.label = 'server';
	return () => <p>{this.state.label}</p>;
}

function CounterRoot(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}

const adoptedButtonKey = createRef<HTMLButtonElement>('hydrated-button');

function ButtonRefRoot(this: Component<{}>, props: { capture?(instance: Component<{}>): void }) {
	props.capture?.(this);
	return () => <button ref={this.ref(adoptedButtonKey)}>save</button>;
}

function SiblingRoot(
	this: Component<{}>,
	props: { firstClass?: string; firstLabel?: string; input?: boolean }
) {
	return () => (
		<>
			{props.input ? (
				<input value="fresh" />
			) : (
				<p className={props.firstClass}>{props.firstLabel ?? 'one'}</p>
			)}
			<p>{props.input ? 'stable' : 'two'}</p>
		</>
	);
}

/** Compiler-issued target forwarding root. */
export const targetForwardingRoot = <TargetForwardingRoot />;

/** Configures client-side observation for the compiled enhancement fixture. */
export function configureAdoptionEnhancement(
	observe: (root: RootLifecycle<HTMLElement>) => void
): void {
	observeEnhancementRoot = observe;
}

/** Compiler-issued enhanced page root. */
export const enhancedPageRoot = <EnhancedPage />;

/** Reads the mounted dynamic panel fixture instance. */
export function mountedDynamicPanel(): Component<{ active: boolean }> {
	if (!dynamicPanelInstance) throw new Error('Dynamic panel fixture has not been mounted');
	return dynamicPanelInstance;
}

/** Compiler-issued dynamic panel page root. */
export const dynamicPanelRoot = <DynamicPanelPage />;

/** Returns the mounted compiled keyed-list instance. */
export function mountedKeyedList(): Component<{
	items: { id: string; title: string }[];
}> {
	if (!keyedListInstance) throw new Error('Keyed list fixture has not been mounted');
	return keyedListInstance;
}

/** Compiler-issued keyed-list root. */
export const keyedListRoot = <KeyedAdoptionList />;

/** Selects the finite registry entry used by the compiled adoption root. */
export function configureRegistrySelection(selection: 'first' | 'second'): void {
	registrySelection = selection;
}

/** Compiler-issued finite registry adoption root. */
export const registryRoot = <RegistryParent />;

/** Configures test-owned observers for the compiler-issued nested target root. */
export function configureNestedTargetRoot(props: NestedTargetProps): void {
	nestedTargetObservers = props;
}

/** Compiler-issued nested target root. */
export const nestedTargetRoot = <NestedTargetRoot />;

/** Compiler-issued dirty-input root. */
export const inputRoot = <InputRoot />;

/** Creates a compiler-issued input binding root. */
export const boundInputRoot = (publish: (value: string) => void) => (
	<BoundInputRoot publish={publish} />
);

/** Creates a compiler-issued disclosure binding root. */
export const disclosureRoot = (publish: (value: boolean) => void) => (
	<DisclosureRoot publish={publish} />
);

/** Creates a compiler-issued paragraph root. */
export const paragraphRoot = (label: string, className?: unknown, stale = false) => (
	<ParagraphRoot label={label} className={className} stale={stale} />
);

/** Creates a compiler-issued iframe root from an externally authorized value. */
export const unsafeIframeRoot = (content: unknown) => <UnsafeIframeRoot content={content} />;

/** Compiler-issued simple component root. */
export const greetingRoot = <GreetingRoot />;

/** Compiler-issued nested-component root. */
export const nestedParentRoot = <NestedParent />;

/** Creates a compiler-issued stateful label root. */
export const labelStateRoot = (capture?: (instance: Component<{ label: string }>) => void) => (
	<LabelStateRoot capture={capture} />
);

/** Creates a compiler-issued prop-driven label root. */
export const labelPropsRoot = (label: string) => <LabelPropsRoot label={label} />;

/** Creates a compiler-issued dynamic label root. */
export const dynamicLabelRoot = (capture?: (instance: Component<{ label: string }>) => void) => (
	<DynamicLabelRoot capture={capture} />
);

/** Compiler-issued interactive counter root. */
export const counterRoot = <CounterRoot />;

/** Creates a compiler-issued ref root. */
export const buttonRefRoot = (capture?: (instance: Component<{}>) => void) => (
	<ButtonRefRoot capture={capture} />
);

/** Ref key fulfilled by the compiler-issued button fixture. */
export const buttonRefKey = adoptedButtonKey;

/** Creates a compiler-issued transparent sibling root. */
export const siblingRoot = (props: {
	firstClass?: string;
	firstLabel?: string;
	input?: boolean;
}) => <SiblingRoot {...props} />;
