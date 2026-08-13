import { unwrap, type RootBinding } from '@exactjs/core';
import type { AccessibilityProps } from './contracts.js';

const focusStacks = new WeakMap<Document, FocusScopeSession[]>();

/** Owns one bounded focus entry and restoration session. */
export class FocusScopeSession {
	private target?: HTMLElement;
	private returnTarget?: HTMLElement;
	private active = false;
	private enteredGeneration = 0;
	private focusWasInside = false;
	private readonly onToggle = () => this.reconcile();
	private readonly onClose = () => this.reconcile();
	private readonly onFocusIn = () => {
		this.focusWasInside = true;
	};

	constructor(
		private readonly targetRef: RootBinding<HTMLElement>,
		private readonly props: AccessibilityProps
	) {}

	/** Reconciles target replacement and native dialog activation after publication. */
	reconcile(): void {
		const enabled = unwrap(this.props.focusScope) === true;
		const next = enabled ? this.targetRef.current : undefined;
		if (next !== this.target) {
			this.releaseTarget(true);
			this.target = next;
			next?.addEventListener('focusin', this.onFocusIn);
			if (next?.localName === 'dialog') {
				next.addEventListener('toggle', this.onToggle);
				next.addEventListener('close', this.onClose);
			}
		}
		if (!this.target) {
			this.end();
			return;
		}
		const shouldBeActive =
			this.targetRef.presented &&
			(this.target.localName === 'dialog'
				? this.target.matches(':modal')
				: this.target.isConnected);
		if (shouldBeActive) this.begin();
		else this.end();
	}

	/** Releases listeners and restoration ownership. */
	dispose(): void {
		this.releaseTarget(true);
		this.target = undefined;
	}

	private begin(): void {
		if (this.active) return;
		this.active = true;
		this.focusWasInside = false;
		const current = this.target!.ownerDocument.activeElement;
		this.returnTarget = current instanceof HTMLElement && current.isConnected ? current : undefined;
		const stack = focusStack(this.target!.ownerDocument);
		stack.push(this);
		if (this.enteredGeneration === this.targetRef.generation) return;
		this.enteredGeneration = this.targetRef.generation;
		if (this.targetRef.introduction === 'hydration') return;
		const initial = unwrap(this.props.initialFocus)?.current;
		if (focusEligible(initial)) initial.focus();
	}

	private end(): void {
		if (!this.active) return;
		this.active = false;
		const target = this.target;
		const stack = target ? focusStack(target.ownerDocument) : [];
		const stackIndex = stack.lastIndexOf(this);
		const ownsRestoration = stackIndex === stack.length - 1;
		if (stackIndex >= 0) stack.splice(stackIndex, 1);
		if (!ownsRestoration) return;
		const ownerDocument = target?.ownerDocument;
		const active = ownerDocument?.activeElement;
		const displaced = active === ownerDocument?.body || active === ownerDocument?.documentElement;
		if (
			active instanceof Node &&
			target &&
			!target.contains(active) &&
			!(this.focusWasInside && displaced)
		)
			return;
		const configured = unwrap(this.props.returnFocus);
		if (configured === false) return;
		const destination = configured?.current ?? this.returnTarget;
		if (focusEligible(destination)) destination.focus();
	}

	private releaseTarget(restore: boolean): void {
		if (!this.target) return;
		this.target.removeEventListener('toggle', this.onToggle);
		this.target.removeEventListener('close', this.onClose);
		this.target.removeEventListener('focusin', this.onFocusIn);
		if (restore) this.end();
		else this.active = false;
		this.focusWasInside = false;
	}
}

function focusStack(document: Document): FocusScopeSession[] {
	const existing = focusStacks.get(document);
	if (existing) return existing;
	const created: FocusScopeSession[] = [];
	focusStacks.set(document, created);
	return created;
}

function focusEligible(value: HTMLElement | undefined): value is HTMLElement {
	return (
		!!value && value.isConnected && !value.hasAttribute('disabled') && !value.closest('[inert]')
	);
}
