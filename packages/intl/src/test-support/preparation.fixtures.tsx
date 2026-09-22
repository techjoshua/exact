import type { Child } from '@exactjs/core';
import { IntlLocale, IntlMessage, IntlProvider } from '../components.js';
import type { IntlEnvironment } from '../environment.js';
import type { PreparedIntlActivation } from '../prepared.js';

/** Supplies the real provider context to independently prepared message components. */
export function preparedIntlProvider(environment: IntlEnvironment) {
	return <IntlProvider environment={environment} />;
}

/** Uses the package's ordinary message component without an enhancement routing substitute. */
export function preparedIntlMessage(message: PreparedIntlActivation) {
	return <IntlMessage message={message} />;
}

/** Uses the package's locale contribution with a preselected child. */
export function preparedIntlLocale(children: Child) {
	return <IntlLocale locale>{children}</IntlLocale>;
}

function IntlFragmentPage(props: { children?: Child }) {
	return () => props.children;
}
/** Supplies a public component root for fragment mounting and hydration acceptance. */
export function preparedIntlFragmentRoot(child: Child) {
	return <IntlFragmentPage>{child}</IntlFragmentPage>;
}
export { IntlLocale };

/** Two nested message lifetimes share one native text-host presentation. */
export function preparedIntlTextTree(
	environment: IntlEnvironment,
	message: PreparedIntlActivation
) {
	return (
		<IntlProvider environment={environment}>
			<IntlMessage message={message} /> / <IntlMessage message={message} />
		</IntlProvider>
	);
}

/** Exercises nested message owners through an ordinary authored textarea. */
export function preparedIntlTextHost(
	environment: IntlEnvironment,
	message: PreparedIntlActivation
) {
	return (
		<IntlProvider environment={environment}>
			<textarea>
				<IntlMessage message={message} /> / <IntlMessage message={message} />
			</textarea>
		</IntlProvider>
	);
}
