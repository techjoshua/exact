function Page(props: { label: string }) {
	function LocalLabel() {
		return () => <span>{props.label}</span>;
	}
	return () => <LocalLabel />;
}

export const root = <Page label="local" />;
