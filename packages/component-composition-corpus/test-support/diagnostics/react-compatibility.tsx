import { Widget } from 'react-widget';

function Page() {
	return () => (
		<main>
			<Widget label="foreign" />
		</main>
	);
}

export const root = <Page />;
