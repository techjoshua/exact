/** Minimal provider and enhancement-authored message. */
export const intlMessageSource = `import { createIntlEnvironment, IntlProvider } from '@exactjs/intl';

const environment = createIntlEnvironment({ locale: 'en-US' });

function Greeting(props: { name: string }) {
  return () => (
    <IntlProvider environment={environment}>
      <p intl:message="greeting">
        Hello, {props.name}. Read <a href="/terms">the terms</a>.
      </p>
    </IntlProvider>
  );
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
      <dd><_ intl:unit="distance-road">{props.minimum}-{props.maximum} miles</_></dd>
      <dd><_ intl:unit="distance-road" intl:convert-to="kilometer">{props.detour} miles</_></dd>
      <dt intl:message>Person height</dt>
      <dd><_ intl:cldr="length/person-height">{props.height} inches</_></dd>
      <dt intl:message>Weather</dt>
      <dd><_ intl:unit="temperature-weather">{Math.round(props.temperature)} °F</_></dd>
      <dt intl:message>Fuel economy</dt>
      <dd><_ intl:unit="fuel-economy-road">{props.economy} mpg</_></dd>
      <dt intl:message>Download</dt>
      <dd><_ intl:unit="digital-storage">{props.size} GB</_></dd>
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

/** Translator-facing XLIFF 2.1 extraction with standard inline-code metadata. */
export const intlXliffSource = `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.1" srcLang="en-US">
  <file id="example-app">
    <unit id="greeting">
      <originalData>
        <data id="d1">{&quot;kind&quot;:&quot;value&quot;,&quot;binding&quot;:0}</data>
      </originalData>
      <segment>
        <source>Hello, <ph id="name" dataRef="d1"/>.</source>
      </segment>
    </unit>
  </file>
</xliff>`;
