/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace bindings from JSX attributes. */
import * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement' };
import type { Child } from '@exactjs/core';
import type { PreparedIntlActivation } from '@exactjs/intl/internal';
import {
	IntlAttributes as ServerIntlAttributes,
	IntlLocale as ServerIntlLocale,
	IntlMessage as ServerIntlMessage,
	IntlProvider as ServerIntlProvider
} from '../../intl/src/components.js?exact-target=server';
import type { IntlEnvironment } from '@exactjs/intl';

type FixtureIntlEnvironment = IntlEnvironment;

export { ServerIntlAttributes, ServerIntlLocale, ServerIntlMessage };

function ServerLocaleRoot(props: { environment: FixtureIntlEnvironment }) {
	return () => (
		<ServerIntlProvider environment={props.environment}>
			<section id="localized" intl:locale>
				Localized content
			</section>
		</ServerIntlProvider>
	);
}

function ServerMessageRoot(props: { environment: FixtureIntlEnvironment; message: unknown }) {
	return () => (
		<ServerIntlProvider environment={props.environment}>
			<p intl:message={props.message as PreparedIntlActivation} />
		</ServerIntlProvider>
	);
}

function ServerAttributesRoot(props: {
	environment: FixtureIntlEnvironment;
	placeholder: unknown;
}) {
	return () => (
		<ServerIntlProvider environment={props.environment}>
			<input
				id="search"
				placeholder="Search messages"
				intl:placeholder={props.placeholder as PreparedIntlActivation}
			/>
		</ServerIntlProvider>
	);
}

/** Server-target locale-enhancement fixture root. */
export const serverLocaleRoot = (environment: FixtureIntlEnvironment) => (
	<ServerLocaleRoot environment={environment} />
);

/** Server-target message-enhancement fixture root. */
export const serverMessageRoot = (environment: FixtureIntlEnvironment, message: unknown) => (
	<ServerMessageRoot environment={environment} message={message} />
);

/** Server-target translated-attribute fixture root. */
export const serverAttributesRoot = (environment: FixtureIntlEnvironment, placeholder: unknown) => (
	<ServerAttributesRoot environment={environment} placeholder={placeholder} />
);

function ServerInboxStructure(props: { children: readonly Child[] }) {
	return () => (
		<a href="/messages" key="inbox">
			{props.children}
		</a>
	);
}

/** Server projection of the analyzed movable anchor. */
export const serverInboxStructure = (children: readonly Child[]): Child => (
	<ServerInboxStructure>{children}</ServerInboxStructure>
);

function ServerParagraphTarget(props: { children: readonly Child[] }) {
	return () => <p>{props.children}</p>;
}

/** Server projection of the analyzed message target. */
export const serverParagraphTarget = (children: readonly Child[]): Child => (
	<ServerParagraphTarget>{children}</ServerParagraphTarget>
);
