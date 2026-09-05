import type { Child } from '@exactjs/core';

/** Compiled remote fixture whose props exercise the artifact receive ABI. */
export function BillingArea(props: { label?: string }) {
	return () => props.label ?? 'Loaded billing';
}

/** Compiled remote fixture with static brand output. */
export function BrandArea() {
	return () => 'Loaded brand';
}

/** Compiled remote shell that projects an opaque page-owned child operation. */
export function Shell(props: { children?: Child | Child[] }) {
	return () => props.children;
}

/** Compiled remote shell containing a server-patchable ancestor. */
export function PatchingShell(props: { children?: Child | Child[] }) {
	return () => <section data-exact-id="remote-boundary">{props.children}</section>;
}

/** Compiled remote fixture representing the retiring build. */
export function RetiringArea() {
	return () => 'Old remote';
}

/** Compiled remote fixture representing the replacement build. */
export function ReplacementArea() {
	return () => 'New remote';
}

/** Compiled retiring shell that directly projects page-owned children. */
export function RetiringShell(props: { children?: Child | Child[] }) {
	return () => props.children;
}

/** Compiled replacement shell that reclaims matching page-owned children. */
export function ReplacementShell(props: { children?: Child | Child[] }) {
	return () => props.children;
}
