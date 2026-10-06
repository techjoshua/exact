import { TaskContext, type Component } from '@exactjs/core';

type Carrier = 'ground' | 'air';
const carriers: Carrier[] = ['ground', 'air'];

function readCalendarDate(value: Date | null): number | null {
	return value?.getTime()!.valueOf() ?? null;
}

/** Exercises conversion and disclosure ownership through shared compiled control paths. */
export function FormBindingProbe(
	this: Component<{
		number: number | null;
		choice: number;
		carrier: Carrier;
		carriers: Carrier[];
		label: string;
		numbers: number[] | null;
		labels: string[] | undefined;
		expanded: boolean;
		modal: boolean;
		calendarDate: Date | null;
		dateRead: number | null;
		dateReads: number[];
		date: number | null;
		datetime: number | null;
		time: number | null;
		month: number | null;
		week: number | null;
		temporalType: string;
	}>,
	props: { modal?: boolean }
) {
	this.state.number = 2;
	this.state.choice = 2;
	this.state.carrier = 'ground';
	this.state.carriers = ['ground'];
	this.state.label = '2';
	this.state.numbers = [2];
	this.state.labels = ['2'];
	this.state.expanded = false;
	this.state.modal = false;
	this.state.calendarDate = null;
	this.state.dateRead = null;
	this.state.dateReads = [];
	this.state.date = 1767312000000;
	this.state.datetime = 1767323040000;
	this.state.time = 11040000;
	this.state.month = 672;
	this.state.week = 1766966400000;
	this.state.temporalType = 'date';
	const readDate = (task: TaskContext = TaskContext.client().blocking()) => {
		void task;
		this.state.dateReads.push(0);
		this.state.dateRead = readCalendarDate(this.state.calendarDate);
		const nativeRead = this.state.calendarDate?.getTime()!.valueOf() ?? null;
		if (nativeRead !== this.state.dateRead)
			throw new Error('Optional Date task read disagrees with its unchanged helper');
	};
	return () => (
		<section id="form-binding-probe">
			<input
				id="form-native-date-preview"
				type="DATE"
				value={new Date('+010000-01-02T00:00:00.000Z')}
			/>
			<input id="form-native-date" type="DATE" value:onChange={this.state.calendarDate} />
			<output id="form-native-date-result">
				{this.state.calendarDate?.toISOString() ?? 'empty'}
			</output>
			<button id="form-native-date-read" onClick={() => readDate()}>
				Read selected date
			</button>
			<output id="form-native-date-read-result">
				{this.state.dateRead ?? 'empty'}|{this.state.dateReads.length}
			</output>
			<input id="form-temporal-date" type="date" value:onChange={this.state.date} />
			<input
				id="form-temporal-datetime"
				type="datetime-local"
				value:onChange={this.state.datetime}
			/>
			<input id="form-temporal-time" type="time" value:onChange={this.state.time} />
			<input id="form-temporal-month" type="month" value:onChange={this.state.month} />
			<input id="form-temporal-week" type="week" value:onChange={this.state.week} />
			<input id="form-temporal-explicit" type="date" value={this.state.date} />
			<input
				id="form-temporal-dynamic"
				value:onChange={this.state.date}
				type={this.state.temporalType}
			/>
			<button
				id="form-temporal-type"
				onClick={() =>
					(this.state.temporalType = this.state.temporalType === 'date' ? 'text' : 'date')
				}
			>
				Change input type
			</button>
			<output id="form-temporal-result">
				{[
					this.state.date,
					this.state.datetime,
					this.state.time,
					this.state.month,
					this.state.week
				].join('|')}
			</output>
			{carriers.map((carrier) => (
				<label>
					<input
						id={'form-carrier-radio-' + carrier}
						type="radio"
						name="form-carrier"
						value={carrier}
						checked:onChange={this.state.carrier}
					/>
					<input
						id={'form-carrier-group-' + carrier}
						type="checkbox"
						value={carrier}
						checked:onChange={this.state.carriers}
					/>
					{carrier}
				</label>
			))}
			<output id="form-carrier-result">
				{this.state.carrier}|{this.state.carriers.join(',')}
			</output>
			<input id="form-number-text" type="text" value:onInput={this.state.number} />
			<input id="form-number-native" type="number" value:onInput={this.state.number} />
			<input
				id="form-radio-two"
				type="radio"
				name="form-choice"
				value="2"
				checked:onChange={this.state.choice}
			/>
			<input
				id="form-radio-three"
				type="radio"
				name="form-choice"
				value={3}
				checked:onChange={this.state.choice}
			/>
			<input
				id="form-label-two"
				type="radio"
				name="form-label"
				value={2}
				checked:onChange={this.state.label}
			/>
			<input
				id="form-label-three"
				type="radio"
				name="form-label"
				value={3}
				checked:onChange={this.state.label}
			/>
			<input
				id="form-group-number"
				type="checkbox"
				value="2"
				checked:onChange={this.state.numbers}
			/>
			<input id="form-group-label" type="checkbox" value={2} checked:onChange={this.state.labels} />
			<select id="form-label-select" multiple value:onChange={this.state.labels}>
				<option value={2}>Two</option>
				<option value="3">Three</option>
			</select>
			<details id="form-disclosure" open:onToggle={this.state.expanded}>
				<summary>Expand</summary>Contents
			</details>
			{props.modal && (
				<dialog id="form-modal" modal:isOpen={this.state.modal}>
					Settings
				</dialog>
			)}
			<button id="form-modal-toggle" onClick={() => (this.state.modal = !this.state.modal)}>
				Toggle modal
			</button>
			<button
				id="form-binding-reset"
				onClick={() => {
					this.state.number = 2;
					this.state.choice = 2;
					this.state.carrier = 'ground';
					this.state.carriers = ['ground'];
					this.state.label = '2';
					this.state.numbers = [2];
					this.state.labels = ['2'];
					this.state.expanded = false;
					this.state.calendarDate = null;
					this.state.dateRead = null;
					this.state.dateReads = [];
					this.state.date = 1767312000000;
					this.state.datetime = 1767323040000;
					this.state.time = 11040000;
					this.state.month = 672;
					this.state.week = 1766966400000;
					this.state.temporalType = 'date';
				}}
			>
				Reset
			</button>
			<output id="form-binding-result">
				{[
					String(this.state.number),
					this.state.choice,
					this.state.label,
					String(JSON.stringify(this.state.numbers)),
					String(JSON.stringify(this.state.labels)),
					String(this.state.expanded)
				].join('|')}
			</output>
		</section>
	);
}
