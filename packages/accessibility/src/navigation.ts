import { ensureElementId, unwrap, type RootBinding } from '@exactjs/core';
import type { AccessibilityProps, NavigateOptions, NavigateOrientation } from './contracts.js';

type SupportedRole = 'tablist' | 'listbox' | 'radiogroup' | 'toolbar' | 'grid';
type NavigationPolicy = {
	role: SupportedRole;
	orientation: NavigateOrientation;
	wrap: boolean;
	itemSelector: string;
};

const compositeSelector =
	'[role="tablist"],[role="listbox"],[role="radiogroup"],[role="toolbar"],[role="grid"],[role="treegrid"],[role="tree"],[role="menu"],[role="menubar"]';
const eligibilityAttributes = [
	'role',
	'id',
	'hidden',
	'inert',
	'disabled',
	'aria-disabled',
	'tabindex',
	'class',
	'style'
];

/** Owns keyboard focus movement for one supported custom ARIA composite. */
export class CompositeNavigationSession {
	private target?: HTMLElement;
	private observer?: MutationObserver;
	private items: HTMLElement[] = [];
	private active?: HTMLElement;
	private ownedActiveDescendant?: string;
	private ownedWrites = false;
	private readonly ownedTabIndex = new WeakMap<
		HTMLElement,
		{ authored: string | null; written: string }
	>();
	private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
	private readonly onMutation = () => {
		if (!this.ownedWrites) this.scan();
	};

	constructor(
		private readonly targetRef: RootBinding<HTMLElement>,
		private readonly props: AccessibilityProps
	) {}

	/** Reconciles activation and target replacement after a committed render. */
	reconcile(): void {
		const enabled = unwrap(this.props.navigate);
		const next = enabled ? this.targetRef.current : undefined;
		if (next === this.target) {
			if (next) this.scan();
			return;
		}
		this.releaseTarget();
		this.target = next;
		if (!next) return;
		this.policy();
		next.addEventListener('keydown', this.onKeyDown);
		this.observer = new MutationObserver(this.onMutation);
		this.observer.observe(next, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: eligibilityAttributes
		});
		this.scan();
	}

	/** Releases DOM listeners and restores only tab-index values owned by this session. */
	dispose(): void {
		this.releaseTarget();
		this.target = undefined;
	}

	private scan(): void {
		const target = this.target;
		if (!target) return;
		const policy = this.policy();
		const previousItems = this.items;
		const previousIndex = this.active ? previousItems.indexOf(this.active) : -1;
		const previousId = this.active?.id;
		this.items = this.eligibleItems(target, policy);
		for (const item of previousItems) if (!this.items.includes(item)) this.restoreTabIndex(item);
		if (!this.items.length) {
			this.active = undefined;
			this.write(() => {
				this.removeOwnedActiveDescendant();
				for (const item of previousItems) this.restoreTabIndex(item);
				this.setOwnedTabIndex(target, 0);
			});
			return;
		}
		if (!this.active || !this.items.includes(this.active)) {
			this.active =
				(previousId ? this.items.find((item) => item.id === previousId) : undefined) ??
				this.items.find((item) => item.tabIndex === 0) ??
				this.items.find(
					(item) =>
						item.getAttribute('aria-selected') === 'true' ||
						item.getAttribute('aria-checked') === 'true'
				) ??
				this.items[Math.min(Math.max(previousIndex, 0), this.items.length - 1)];
		}
		this.publishActive(false);
	}

	private handleKeyDown(event: KeyboardEvent): void {
		if (!this.target || event.defaultPrevented || event.altKey || event.metaKey) return;
		this.scan();
		if (!this.active || !this.items.length) return;
		if (this.handleGridEditing(event)) return;
		const policy = this.policy();
		if (policy.role === 'toolbar' && ownsArrowKeys(event.target)) return;
		const next =
			policy.role === 'grid' ? this.gridDestination(event) : this.linearDestination(event, policy);
		if (!next || next === this.active) return;
		event.preventDefault();
		this.active = next;
		this.publishActive(true);
	}

	private linearDestination(
		event: KeyboardEvent,
		policy: NavigationPolicy
	): HTMLElement | undefined {
		const options = this.options();
		if (options.homeEnd !== false && event.key === 'Home') return this.items[0];
		if (options.homeEnd !== false && event.key === 'End') return this.items.at(-1);
		const pageSize = validPageSize(options.pageSize);
		if (pageSize && event.key === 'PageUp') return this.offsetActive(-pageSize, false);
		if (pageSize && event.key === 'PageDown') return this.offsetActive(pageSize, false);
		let offset = 0;
		if (
			(policy.orientation === 'horizontal' || policy.orientation === 'both') &&
			event.key === 'ArrowLeft'
		)
			offset = -1;
		else if (
			(policy.orientation === 'horizontal' || policy.orientation === 'both') &&
			event.key === 'ArrowRight'
		)
			offset = 1;
		else if (
			(policy.orientation === 'vertical' || policy.orientation === 'both') &&
			event.key === 'ArrowUp'
		)
			offset = -1;
		else if (
			(policy.orientation === 'vertical' || policy.orientation === 'both') &&
			event.key === 'ArrowDown'
		)
			offset = 1;
		return offset ? this.offsetActive(offset, policy.wrap) : undefined;
	}

	private gridDestination(event: KeyboardEvent): HTMLElement | undefined {
		const rows = this.gridRows();
		const location = rows
			.map((row, rowIndex) => ({ row, rowIndex, columnIndex: row.indexOf(this.active!) }))
			.find((candidate) => candidate.columnIndex >= 0);
		if (!location) return undefined;
		const options = this.options();
		if (event.key === 'Home') return event.ctrlKey ? rows[0]?.[0] : location.row[0];
		if (event.key === 'End') return event.ctrlKey ? rows.at(-1)?.at(-1) : location.row.at(-1);
		const pageSize = validPageSize(options.pageSize);
		let rowOffset = 0;
		let columnOffset = 0;
		if (event.key === 'ArrowUp') rowOffset = -1;
		else if (event.key === 'ArrowDown') rowOffset = 1;
		else if (event.key === 'PageUp' && pageSize) rowOffset = -pageSize;
		else if (event.key === 'PageDown' && pageSize) rowOffset = pageSize;
		else if (event.key === 'ArrowLeft') columnOffset = this.physicalColumnOffset(-1);
		else if (event.key === 'ArrowRight') columnOffset = this.physicalColumnOffset(1);
		else return undefined;
		if (columnOffset) return location.row[location.columnIndex + columnOffset];
		const nextRow = rows[clamp(location.rowIndex + rowOffset, 0, rows.length - 1)];
		return nextRow?.[clamp(location.columnIndex, 0, nextRow.length - 1)];
	}

	private handleGridEditing(event: KeyboardEvent): boolean {
		if (this.policy().role !== 'grid' || !this.active) return false;
		const source = event.target;
		if (source instanceof Node && source !== this.active && this.active.contains(source)) {
			if (event.key !== 'Escape') return true;
			event.preventDefault();
			this.active.focus();
			return true;
		}
		if (event.key !== 'F2' && event.key !== 'Enter') return false;
		const editor = this.active.querySelector<HTMLElement>(focusableSelector);
		if (!editor) return false;
		event.preventDefault();
		editor.focus();
		return true;
	}

	private publishActive(moveFocus: boolean): void {
		const target = this.target;
		const active = this.active;
		if (!target || !active) return;
		const mode = this.options().mode ?? 'roving';
		this.write(() => {
			if (mode === 'activeDescendant') {
				this.setOwnedTabIndex(target, 0);
				const id = ensureElementId(active);
				target.setAttribute('aria-activedescendant', id);
				this.ownedActiveDescendant = id;
				for (const item of this.items) this.restoreTabIndex(item);
				if (moveFocus) target.focus();
				return;
			}
			this.removeOwnedActiveDescendant();
			this.restoreTabIndex(target);
			for (const item of this.items) {
				this.setOwnedTabIndex(item, item === active ? 0 : -1);
			}
			if (moveFocus) active.focus();
		});
	}

	private eligibleItems(target: HTMLElement, policy: NavigationPolicy): HTMLElement[] {
		return Array.from(target.querySelectorAll<HTMLElement>(policy.itemSelector)).filter((item) => {
			if (item.closest(compositeSelector) !== target) return false;
			if (item.hidden || item.closest('[hidden],[inert]')) return false;
			if (item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true')
				return false;
			return policy.role === 'toolbar' ? item.matches(focusableSelector) : true;
		});
	}

	private gridRows(): HTMLElement[][] {
		const target = this.target!;
		return Array.from(target.querySelectorAll<HTMLElement>('[role="row"]'))
			.filter((row) => row.closest(compositeSelector) === target)
			.map((row) =>
				Array.from(
					row.querySelectorAll<HTMLElement>(
						'[role="gridcell"],[role="rowheader"],[role="columnheader"]'
					)
				).filter((cell) => this.items.includes(cell))
			)
			.filter((row) => row.length);
	}

	private policy(): NavigationPolicy {
		const target = this.target;
		const role = target?.getAttribute('role');
		const options = this.options();
		const authoredOrientation = target?.getAttribute('aria-orientation');
		const orientation =
			options.orientation ??
			(authoredOrientation === 'horizontal' || authoredOrientation === 'vertical'
				? authoredOrientation
				: undefined);
		switch (role) {
			case 'tablist':
				return policy('tablist', orientation ?? 'horizontal', options.wrap ?? true, '[role="tab"]');
			case 'listbox':
				return policy(
					'listbox',
					orientation ?? 'vertical',
					options.wrap ?? false,
					'[role="option"]'
				);
			case 'radiogroup':
				return policy('radiogroup', orientation ?? 'both', options.wrap ?? true, '[role="radio"]');
			case 'toolbar':
				return policy(
					'toolbar',
					orientation ?? 'horizontal',
					options.wrap ?? true,
					focusableSelector
				);
			case 'grid':
				return policy(
					'grid',
					'both',
					false,
					'[role="gridcell"],[role="rowheader"],[role="columnheader"]'
				);
			default:
				throw new TypeError(
					`a11y:navigate requires a supported role: tablist, listbox, radiogroup, toolbar, or grid; received ${role ?? 'none'}`
				);
		}
	}

	private options(): NavigateOptions {
		const value = unwrap(this.props.navigate);
		return value === true || !value ? {} : value;
	}

	private offsetActive(offset: number, wrap: boolean): HTMLElement | undefined {
		const index = this.items.indexOf(this.active!);
		const candidate = index + offset;
		if (wrap)
			return this.items[((candidate % this.items.length) + this.items.length) % this.items.length];
		return this.items[clamp(candidate, 0, this.items.length - 1)];
	}

	private physicalColumnOffset(offset: number): number {
		return getComputedStyle(this.target!).direction === 'rtl' ? -offset : offset;
	}

	private setOwnedTabIndex(element: HTMLElement, value: number): void {
		const written = String(value);
		const ownership = this.ownedTabIndex.get(element);
		this.ownedTabIndex.set(element, {
			authored: ownership ? ownership.authored : element.getAttribute('tabindex'),
			written
		});
		element.setAttribute('tabindex', written);
	}

	private restoreTabIndex(element: HTMLElement): void {
		const ownership = this.ownedTabIndex.get(element);
		if (!ownership) return;
		if (element.getAttribute('tabindex') === ownership.written) {
			if (ownership.authored === null) element.removeAttribute('tabindex');
			else element.setAttribute('tabindex', ownership.authored);
		}
		this.ownedTabIndex.delete(element);
	}

	private removeOwnedActiveDescendant(): void {
		if (
			this.target &&
			this.ownedActiveDescendant &&
			this.target.getAttribute('aria-activedescendant') === this.ownedActiveDescendant
		)
			this.target.removeAttribute('aria-activedescendant');
		this.ownedActiveDescendant = undefined;
	}

	private releaseTarget(): void {
		this.observer?.disconnect();
		this.observer = undefined;
		this.target?.removeEventListener('keydown', this.onKeyDown);
		for (const item of this.items) this.restoreTabIndex(item);
		this.removeOwnedActiveDescendant();
		if (this.target) this.restoreTabIndex(this.target);
		this.items = [];
		this.active = undefined;
	}

	private write(operation: () => void): void {
		this.ownedWrites = true;
		try {
			operation();
		} finally {
			queueMicrotask(() => {
				this.ownedWrites = false;
			});
		}
	}
}

const focusableSelector =
	'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]';

function policy(
	role: SupportedRole,
	orientation: NavigateOrientation,
	wrap: boolean,
	itemSelector: string
): NavigationPolicy {
	return { role, orientation, wrap, itemSelector };
}

function validPageSize(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0)
		throw new TypeError('a11y:navigate pageSize must be a positive integer');
	return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function ownsArrowKeys(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		target.matches(
			'textarea,select,[contenteditable="true"],[role="slider"],[role="spinbutton"],[role="combobox"],input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"])'
		)
	);
}
