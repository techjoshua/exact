import type { IntlScalarPresentationConsumer } from '@exactjs/intl';
import type {
	AxisProps,
	ChartAxisInput,
	ChartSeriesInput,
	DataProps,
	LegendProps,
	SeriesProps
} from './contracts.js';

/** One axis registration retained by its owning Axis component. */
export interface ChartAxisRegistration {
	readonly props: AxisProps;
	readonly textLabel?: string;
	label?: IntlScalarPresentationConsumer;
}

/** One series registration retained by its owning Series component. */
export interface ChartSeriesRegistration {
	readonly chartId: string;
	readonly props: SeriesProps;
	readonly data: Map<string, ChartDatumRegistration>;
	readonly textLabel?: string;
	label?: IntlScalarPresentationConsumer;
}

/** One datum registration retained by its owning Data component. */
export interface ChartDatumRegistration {
	readonly props: DataProps;
	label?: IntlScalarPresentationConsumer;
	description?: IntlScalarPresentationConsumer;
}

/** Instance-owned registrations consumed by one chart plot. */
export class ChartModel {
	readonly axes = new Map<string, ChartAxisRegistration>();
	readonly series = new Map<string, ChartSeriesRegistration>();
	private legend: LegendProps | undefined;
	private invalidator: (() => void) | undefined;
	private version = 0;

	/** Attaches the focused plot's update owner after declarations have registered. */
	attachInvalidator(invalidate: () => void): () => void {
		this.invalidator = invalidate;
		return () => {
			if (this.invalidator === invalidate) this.invalidator = undefined;
		};
	}

	/** Normalizes compact inputs without taking ownership of caller arrays. @exact pure */
	seed(
		chartId: string,
		axes: readonly ChartAxisInput[] = [],
		series: readonly ChartSeriesInput[] = []
	): void {
		for (const axis of axes)
			this.registerAxis({
				props: axis,
				...(axis.label === undefined ? {} : { textLabel: axis.label })
			});
		for (const input of series) {
			const registration: ChartSeriesRegistration = {
				chartId,
				props: input,
				data: new Map(),
				...(input.label === undefined ? {} : { textLabel: input.label })
			};
			this.registerSeries(registration);
			for (const datum of input.data)
				this.registerDatum(input.id, {
					props: datum
				});
		}
	}

	/** Advances model identity and invalidates the attached plot owner, if mounted. */
	changed(): void {
		this.version++;
		this.invalidator?.();
	}

	/** Registers one uniquely identified axis. */
	registerAxis(registration: ChartAxisRegistration): void {
		registerUnique(this.axes, registration.props.id, registration, () => this.changed(), 'axis');
	}

	/** Releases an axis only when the caller still owns its registered identity. */
	unregisterAxis(registration: ChartAxisRegistration): void {
		unregisterOwned(this.axes, registration.props.id, registration, () => this.changed());
	}

	/** Registers one uniquely identified series. */
	registerSeries(registration: ChartSeriesRegistration): void {
		registerUnique(
			this.series,
			registration.props.id,
			registration,
			() => this.changed(),
			'series'
		);
	}

	/** Releases a series only when the caller still owns its registered identity. */
	unregisterSeries(registration: ChartSeriesRegistration): void {
		unregisterOwned(this.series, registration.props.id, registration, () => this.changed());
	}

	/** Registers one uniquely identified datum beneath an existing series owner. */
	registerDatum(seriesId: string, registration: ChartDatumRegistration): void {
		const series = this.series.get(seriesId);
		if (!series) throw new Error(`Chart datum ${registration.props.id} has no owning series`);
		registerUnique(series.data, registration.props.id, registration, () => this.changed(), 'datum');
	}

	/** Releases a datum only when the caller still owns its registered identity. */
	unregisterDatum(seriesId: string, registration: ChartDatumRegistration): void {
		const series = this.series.get(seriesId);
		if (!series) return;
		unregisterOwned(series.data, registration.props.id, registration, () => this.changed());
	}

	/** Selects the chart's single optional legend. */
	requestLegend(props: LegendProps): void {
		if (this.legend) throw new Error('A chart can contain only one Legend');
		this.legend = props;
		this.changed();
	}

	/** Releases the legend only when the caller still owns its selection. */
	releaseLegend(props: LegendProps): void {
		if (this.legend !== props) return;
		this.legend = undefined;
		this.changed();
	}

	/** Monotonic model version useful to inspections without becoming application state. */
	get revision(): number {
		return this.version;
	}

	/** Reports whether a declarative legend has been registered. */
	get hasLegend(): boolean {
		return this.legend !== undefined;
	}

	/** Returns the current chart-owned legend policy when selected. */
	get legendProps(): LegendProps | undefined {
		return this.legend;
	}

	/** Reads every optional scalar slot so one presentation computation owns their dependencies. */
	get presentationRevision(): number {
		let revision = 0;
		for (const axis of this.axes.values()) if (axis.label?.presentation) revision++;
		for (const series of this.series.values()) {
			if (series.label?.presentation) revision++;
			for (const datum of series.data.values()) {
				if (datum.label?.presentation) revision++;
				if (datum.description?.presentation) revision++;
			}
		}
		return revision;
	}
}

function registerUnique<Value>(
	entries: Map<string, Value>,
	id: string,
	value: Value,
	invalidate: () => void,
	kind: string
): void {
	if (!id.trim()) throw new TypeError(`Chart ${kind} ID cannot be empty`);
	if (entries.has(id)) throw new Error(`Duplicate chart ${kind} ID ${id}`);
	entries.set(id, value);
	invalidate();
}

function unregisterOwned<Value>(
	entries: Map<string, Value>,
	id: string,
	value: Value,
	invalidate: () => void
): void {
	if (entries.get(id) !== value) return;
	entries.delete(id);
	invalidate();
}
