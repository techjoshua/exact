/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace bindings from JSX attributes. */
import * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement' };
import type { Child } from '@exactjs/core';
import type { PreparedIntlActivation } from '@exactjs/intl/internal';
import {
	IntlAttributes as CompiledIntlAttributes,
	IntlLocale as CompiledIntlLocale,
	IntlMessage as CompiledIntlMessage,
	IntlProvider as CompiledIntlProvider
} from '../../intl/src/components.js?exact-target=client';
import type { IntlEnvironment } from '@exactjs/intl';

type FixtureIntlEnvironment = IntlEnvironment;

export { CompiledIntlAttributes, CompiledIntlLocale, CompiledIntlMessage };

function LocaleRoot(props: { environment: FixtureIntlEnvironment }) {
	return () => (
		<CompiledIntlProvider environment={props.environment}>
			<section id="localized" intl:locale>
				Localized content
			</section>
		</CompiledIntlProvider>
	);
}

function MessageRoot(props: { environment: FixtureIntlEnvironment; message: unknown }) {
	return () => (
		<CompiledIntlProvider environment={props.environment}>
			<p intl:message={props.message as PreparedIntlActivation} />
		</CompiledIntlProvider>
	);
}

function AttributesRoot(props: { environment: FixtureIntlEnvironment; placeholder: unknown }) {
	return () => (
		<CompiledIntlProvider environment={props.environment}>
			<input
				id="search"
				placeholder="Search messages"
				intl:placeholder={props.placeholder as PreparedIntlActivation}
			/>
		</CompiledIntlProvider>
	);
}

/** Compiler-owned locale-enhancement fixture root. */
export const localeRoot = (environment: FixtureIntlEnvironment) => (
	<LocaleRoot environment={environment} />
);

/** Compiler-owned message-enhancement fixture root. */
export const messageRoot = (environment: FixtureIntlEnvironment, message: unknown) => (
	<MessageRoot environment={environment} message={message} />
);

/** Compiler-owned translated-attribute fixture root. */
export const attributesRoot = (environment: FixtureIntlEnvironment, placeholder: unknown) => (
	<AttributesRoot environment={environment} placeholder={placeholder} />
);

function InboxStructure(props: { children: readonly Child[] }) {
	return () => (
		<a href="/messages" key="inbox">
			{props.children}
		</a>
	);
}

/** Preserves the analyzed movable anchor through compiler-owned JSX. */
export const inboxStructure = (children: readonly Child[]): Child => (
	<InboxStructure>{children}</InboxStructure>
);

function ParagraphTarget(props: { children: readonly Child[] }) {
	return () => <p>{props.children}</p>;
}

/** Reconstructs the analyzed message target through compiler-owned JSX. */
export const paragraphTarget = (children: readonly Child[]): Child => (
	<ParagraphTarget>{children}</ParagraphTarget>
);
