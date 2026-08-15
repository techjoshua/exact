/** Minimal provider and enhancement-authored message. */
export const intlMessageSource = `import { createIntlEnvironment, IntlProvider } from '@exactjs/intl';

const environment = createIntlEnvironment({ sourceLocale: 'en-US', locale: 'fr-FR' });

function Greeting(props: { name: string }) {
  return () => (
    <IntlProvider environment={environment}>
      <p intl:message="greeting">
        Hello, {props.name}. Read <a href="/terms">the terms</a>.
      </p>
    </IntlProvider>
  );
}`;

/** Locale scopes project document metadata and reuse or create the matching provider. */
export const intlLocaleSource = `import { defineIntlLocale } from '@exactjs/intl';

function LocalizedRoot(props: { requestedLocale: string }) {
  const locale = defineIntlLocale(props.requestedLocale);
  return () => <main intl:locale={locale}>{/* localized application */}</main>;
}

function InheritedLocalePanel() {
  return () => <section intl:locale>{/* reuses the nearest IntlProvider */}</section>;
}`;

/** Message structure, finite selection, and opaque-fragment authoring. */
export const intlStructureSource = `function Transfer(props: TransferProps) {
  return () => (
    <p intl:message="transfer-status">
      {props.sent ? 'Sent' : 'Send'}
      <strong intl:fragment="report">the quarterly report</strong> to
      <_ intl:fragment="recipient"><RecipientBadge user={props.recipient} /></_>.
    </p>
  );
}`;

/** Nested selector and formatter roles contributing to one lexical message. */
export const intlCompositionSource = `function Delivery(props: { count: number; distance: number }) {
  return () => (
    <p intl:message="delivery-summary">
      <_ intl:plural={props.count}>
        {props.count === 1 ? 'One package' : \`\${props.count} packages\`}
      </_>
      covering <span intl:unit="distance-road">{props.distance} miles</span>.
    </p>
  );
}

function Inbox(props: { count: number }) {
  return () => (
    <p intl:plural={{ value: props.count, name: 'inbox-count' }}>
      You have {props.count ? \`\${props.count}\` : 'no'} new messages.
    </p>
  );
}`;

/** Preferred native cardinal category-map authoring in a Polish source package. */
export const intlCardinalSource = `const cardinals = new Intl.PluralRules('pl-PL');
const inboxForms = { one: 'wiadomość', few: 'wiadomości', many: 'wiadomości', other: 'wiadomości' };

function Inbox(props: { count: number; minimum: number; maximum: number }) {
  return () => (
    <>
      <p intl:message>{props.count} {inboxForms[cardinals.select(props.count)]}</p>
      <p intl:message>{props.minimum}-{props.maximum} {inboxForms[cardinals.selectRange(props.minimum, props.maximum)]}</p>
    </>
  );
}`;

/** Preferred native ordinal category-map authoring in an English source package. */
export const intlOrdinalSource = `const ordinals = new Intl.PluralRules('en-US', { type: 'ordinal' });
const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

function Placement(props: { position: number }) {
  return () => (
    <p intl:message>Finished {props.position}{suffix[ordinals.select(props.position)]}.</p>
  );
}`;

/** Enhancement-style semantic measurements and source-precision inference. */
export const intlUnitsSource = `function Measurements(props: Measurements) {
  return () => (
    <dl>
      <dt intl:message>Driving distance</dt>
      <dd intl:unit="distance-road">{props.minimum}-{props.maximum} miles</dd>
      <dd intl:unit="distance-road" intl:convert-to="kilometer">{props.detour} miles</dd>
      <dt intl:message>Person height</dt>
      <dd intl:cldr="length/person-height">{props.height} inches</dd>
      <dt intl:message>Weather</dt>
      <dd intl:unit="temperature-weather">{Math.round(props.temperature)} °F</dd>
      <dt intl:message>Fuel economy</dt>
      <dd intl:unit="fuel-economy-road">{props.economy} mpg</dd>
      <dt intl:message>Download</dt>
      <dd intl:unit="digital-storage">{props.size} GB</dd>
    </dl>
  );
}`;

/** Currency inference plus preferred native ECMA-402 formatter expressions. */
export const intlFormattersSource = `function Receipt(props: ReceiptProps) {
  return () => (
    <section intl:message="receipt-summary">
      Total: <_ intl:currency>\${props.total}</_>.
      Published {new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(props.date)}.
      Reporting period: {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).formatRange(props.start, props.end)}.
      Language: {new Intl.DisplayNames('en-US', { type: 'language' }).of(props.language)}.
      Contributors: {new Intl.ListFormat('en-US', { type: 'conjunction' }).format(props.names)}.
    </section>
  );
}`;

/** Compiler lowering in components and explicit cache usage in ordinary helpers. */
export const intlCacheSource = `import { intl, type Component } from '@exactjs/core';

export function formatPrice(value: number, locale: string) {
  return intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

function Summary(this: Component<{ count: number }>, props: { published: Date }) {
  const ordinals = new Intl.PluralRules('en-US', { type: 'ordinal' });

  return () => (
    <p>
      Result {this.state.count} is {ordinals.select(this.state.count)};
      published {props.published.toLocaleDateString('en-US')}.
    </p>
  );
}`;

/** Temporal duration projection expressed through native relative-time intent. */
export const intlDurationSource = `const relativeTime = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

function relativeAge(duration: Temporal.Duration) {
  const units = [
    { value: duration.years, unit: 'year' },
    { value: duration.months, unit: 'month' },
    { value: duration.weeks, unit: 'week' },
    { value: duration.days, unit: 'day' },
    { value: duration.hours, unit: 'hour' },
    { value: duration.minutes, unit: 'minute' },
    { value: duration.seconds, unit: 'second' }
  ] as const;
  const match = units.find(({ value }) => Math.abs(value) > 0);
  return match ? relativeTime.format(-Math.abs(match.value), match.unit) : 'just now';
}

function Published(props: { age: Temporal.Duration }) {
  return () => <p intl:message>Posted {relativeAge(props.age)}.</p>;
}`;

/** Independently translated intrinsic text and a display-name formatter role. */
export const intlPropertiesSource = `function Search(props: { languageCode: string }) {
  return () => (
    <form>
      <input placeholder="Search messages" intl:placeholder />
      <button aria-label={props.languageCode} intl:aria-label="display-name:languageCode" />
      <img src="/empty-inbox.svg" alt="Your inbox is empty" intl:alt />
    </form>
  );
}`;

/** Adapter configuration for extraction, catalogs, and client capabilities. */
export const intlConfigurationSource = `exact({
  internationalization: {
    owner: 'example-app',
    sourceLocale: 'en-US',
    locales: ['fr-FR'],
    catalogFiles: ['./translations/fr-FR.xlf'],
    clientCapabilityProviders: {
      temporal: { kind: 'module', specifier: 'temporal-polyfill/global' }
    }
  }
})`;

/** Language-tool policy for inference explanations and catalog coverage. */
export const intlLanguageToolsSource = `export * as intl from '@exactjs/intl/enhancements' with {
  type: 'exact-enhancement',
  scope: 'package'
};
import { defineConfig } from '@exactjs/config';

export default defineConfig({
  languageExtensions: {
    providers: {
      '@exactjs/intl': {
        sourceLocale: 'en-US',
        catalogFiles: ['./translations/fr-FR.xlf', './translations/ja-JP.xlf'],
        requiredLocales: ['fr-FR', 'ja-JP'],
        catalogHygiene: true,
        localeConsistency: true
      }
    }
  }
});`;

/** Translator-facing XLIFF 2.1 extraction with generic inline-code metadata. */
export const intlXliffSource = `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.1" srcLang="en-US">
  <file id="example-app">
    <unit id="greeting_n1S7c3uY...">
      <segment>
        <source>Hello, <ph id="n1" equiv="{name}" canCopy="yes" canDelete="no"/>.</source>
      </segment>
    </unit>
  </file>
</xliff>`;
