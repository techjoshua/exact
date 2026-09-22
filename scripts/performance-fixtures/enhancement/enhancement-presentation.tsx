/** The same contributor is used both explicitly and through incoming enhancement routing. */
export function Presentation(props: { label: string }) {
	return () => <_target title={props.label} />;
}

/** An independent same-tag owner exercises coalesced presentation without duplicating hosts. */
export function Secondary(props: { lang: string }) {
	return () => <_target lang={props.lang} />;
}
