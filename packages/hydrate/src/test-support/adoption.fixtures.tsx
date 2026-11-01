import {
	createComponentRegistry,
	createEnhancementNode,
	createRef,
	type Child,
	type Component,
	type AnyComponentInstance,
	type RefBinding,
	type RootLifecycle
} from '@exactjs/core';

export const adoptionEnhancementIdentity = '@exactjs/hydrate:test-enhancement#default';
const adoptionEnhancement = createEnhancementNode([
	{ identity: adoptionEnhancementIdentity, props: {} }
]);

let observeEnhancementRoot: (root: RootLifecycle<HTMLElement>) => void = () => undefined;

/** Enhancement fixture compiled through the native component ABI. */
export function AdoptionEnhancement(this: Component<{}>) {
	observeEnhancementRoot(this.refs.root<HTMLElement>());
	return () => <_target data-enhanced="yes" />;
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

function ForwardingContribution() {
	return () => <_target className="forwarded" aria-describedby="help" />;
}

function TargetForwardingRoot(this: Component<{}>) {
	return () => (
		<ForwardingContribution>
			<button className="authored">Save</button>
		</ForwardingContribution>
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

function OuterContribution() {
	return () => (
		<_target
			className="outer"
			ref={nestedTargetObservers.ref}
			onClick={nestedTargetObservers.onOuter}
		/>
	);
}

function InnerContribution() {
	return () => (
		<_target
			className="inner"
			ref={nestedTargetObservers.ref}
			onClick={nestedTargetObservers.onInner}
		/>
	);
}

function NestedTargetRoot(this: Component<{}>) {
	return () => (
		<OuterContribution>
			<InnerContribution>
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
			</InnerContribution>
		</OuterContribution>
	);
}

function InputRoot(this: Component<{}>) {
	return () => <input value="server" />;
}

function BoundInputRoot(this: Component<{}>, props: { publish(value: string): void }) {
	return () => (
		<input
			data-testid="name"
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
			data-testid="more"
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

/** Page-domain content whose lifetime survives an initial remote-shell replacement. */
export function InitialTransferLeaf(
	this: Component<{}>,
	props: { mounted(): void; unmounted(): void }
) {
	this.onMount(props.mounted);
	this.onUnmount(props.unmounted);
	return () => <strong>Retained</strong>;
}

/** Includes a queued target beside an independently owned transferable child. */
export function InitialTransferShell(props: { children?: Child; active: boolean }) {
	return () => (
		<>
			{props.children}
			{props.active ? <NestedTargetRoot /> : null}
		</>
	);
}

/** Test-owned observations stay outside serialized component inputs. */
export type InitialLifetimeObservers = {
	acquired(instance: AnyComponentInstance): void;
	released(): void;
	parentRef(value: HTMLDivElement | undefined): void;
	receive(phase: string): void;
	parentBinding?(binding: RefBinding<HTMLDivElement>): void;
};
let initialLifetimeObservers: InitialLifetimeObservers = {
	acquired() {},
	released() {},
	parentRef() {},
	receive() {}
};
const parentKey = createRef<HTMLDivElement>('initial-lifetime-parent');
const lifetimeChildKey = createRef<HTMLElement>('initial-lifetime-child');

/** Configures only this physical client fixture module before initial adoption. */
export function configureInitialLifetimeObservers(next: InitialLifetimeObservers): void {
	initialLifetimeObservers = next;
}

/** Records actual client construction and instance-owned cleanup separately from mounting. */
export function UnpublishedLifetimeChild(this: Component<{}>) {
	initialLifetimeObservers.acquired(this.ref(lifetimeChildKey).owner);
	this.onUnmount(() => initialLifetimeObservers.released());
	return () => <strong>Acquired child</strong>;
}

/** Acquires the child before the containing intrinsic's ordinary ref is fulfilled. */
export function UnpublishedLifetimeParent(this: Component<{}>) {
	const binding: RefBinding<HTMLDivElement> = {
		current: undefined,
		key: parentKey,
		owner: this.ref(parentKey).owner,
		fulfill(value) {
			initialLifetimeObservers.parentRef(value);
		}
	};
	return () => (
		<div ref={binding}>
			<UnpublishedLifetimeChild />
		</div>
	);
}

/** Ordinary reactive ref reader used to verify settled prop delivery on a retained component. */
export function ParkedReceiveLeaf(this: Component<{}>, props: { phase: string }) {
	this.onUnmount(() => initialLifetimeObservers.released());
	return () => <strong ref={parkedReceiveRef(this, props.phase)}>Retained</strong>;
}

function parkedReceiveRef(owner: Component<{}>, phase: string): RefBinding<HTMLElement> {
	return {
		current: undefined,
		key: parkedReceiveKey,
		owner: owner.ref(parkedReceiveKey).owner,
		fulfill(value) {
			if (value) initialLifetimeObservers.receive(phase);
		}
	};
}
const parkedReceiveKey = createRef<HTMLElement>('parked-receive');

/** Supplies a direct program to the existing internal adoption owner without serializing a callback. */
export function unpublishedLifetimeProgram(binding?: RefBinding<HTMLDivElement>) {
	return (
		<div ref={binding}>
			<UnpublishedLifetimeChild />
		</div>
	);
}

/** Places an acquired peer before the ref that cancels its enclosing unpublished array. */
export function UnpublishedLifetimeSiblings(this: Component<{}>) {
	const binding: RefBinding<HTMLDivElement> = {
		current: undefined,
		key: parentKey,
		owner: this.ref(parentKey).owner,
		fulfill(value) {
			initialLifetimeObservers.parentRef(value);
		}
	};
	return () => (
		<>
			<UnpublishedLifetimeChild />
			<div ref={binding}>Cancel peers</div>
		</>
	);
}

let sameNodeTitle = 'obsolete';

/** Selects the next instance's ordinary title without transporting authored callbacks. */
export function configureSameNodeTitle(title: string): void {
	sameNodeTitle = title;
}

/** Exposes independent real ref owners while adopting the identical intrinsic and child nodes. */
export function SameNodeLifetimeParent(this: Component<{}>) {
	const title = sameNodeTitle;
	const ordinary = this.ref(parentKey);
	initialLifetimeObservers.parentBinding?.(ordinary);
	const binding: RefBinding<HTMLDivElement> = {
		...ordinary,
		fulfill(value) {
			ordinary.fulfill(value);
			initialLifetimeObservers.parentRef(value);
		}
	};
	return () => (
		<div title={title} onClick={() => initialLifetimeObservers.receive('click')} ref={binding}>
			<UnpublishedLifetimeChild />
		</div>
	);
}

function EmptyEndpointLeaf(this: Component<{}>) {
	return () => null;
}
function MultiEndpointLeaf(this: Component<{}>) {
	return () => (
		<>
			<span>First</span>
			<span>Second</span>
		</>
	);
}
function EmptyEndpointShell(this: Component<{}>) {
	return () => (
		<section>
			<EmptyEndpointLeaf />
			<b>Next</b>
		</section>
	);
}
function MultiEndpointShell(this: Component<{}>) {
	return () => (
		<section>
			<MultiEndpointLeaf />
			<b>Next</b>
		</section>
	);
}
function NestedEndpointShell(this: Component<{}>) {
	return () => (
		<main>
			<MultiEndpointShell />
			<i>Outer next</i>
		</main>
	);
}
/** Compiler-owned empty markerless range before a concrete sibling cursor. */
export const emptyEndpointRoot = <EmptyEndpointShell />;
/** Compiler-owned multi-node markerless range before a concrete sibling cursor. */
export const multiEndpointRoot = <MultiEndpointShell />;
/** Nested markerless component ranges with separate sibling bounds. */
export const nestedEndpointRoot = <NestedEndpointShell />;

function EndpointInterruptLeaf(this: Component<{}>) {
	const ordinary = this.ref(parentKey);
	initialLifetimeObservers.acquired(ordinary.owner);
	this.onUnmount(() => initialLifetimeObservers.released());
	const binding: RefBinding<HTMLDivElement> = {
		...ordinary,
		fulfill(value) {
			ordinary.fulfill(value);
			initialLifetimeObservers.parentRef(value);
		}
	};
	return () => <div ref={binding}>Cancelable child</div>;
}
function EndpointInterruptShell(this: Component<{}>) {
	return () => (
		<section>
			<EndpointInterruptLeaf />
			<b>Next</b>
		</section>
	);
}
/** Cancels markerless child acquisition before its synthetic bounds are inserted. */
export const interruptEndpointRoot = <EndpointInterruptShell />;
