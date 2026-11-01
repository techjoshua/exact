/** Pairs a protocol shape with its expected acceptance at server and client response boundaries. */
export interface OperationValidationCase {
	name: string;
	value: unknown;
	valid: boolean;
}

/** Shared patch witnesses keep buffered and streamed response rejection in agreement. */
export const patchValidationCases: readonly OperationValidationCase[] = [
	{ name: 'text', value: { type: 'text', id: 'target', value: '' }, valid: true },
	{
		name: 'property',
		value: { type: 'prop', id: 'target', name: 'title', value: null },
		valid: true
	},
	{
		name: 'style string',
		value: { type: 'style', id: 'target', name: 'color', value: 'red' },
		valid: true
	},
	{
		name: 'style removal',
		value: { type: 'style', id: 'target', name: 'color', value: null },
		valid: true
	},
	{
		name: 'list insertion',
		value: {
			type: 'list',
			id: 'target',
			op: 'insert',
			key: 'row',
			before: 'next',
			html: '<li>new</li>'
		},
		valid: true
	},
	{ name: 'list move', value: { type: 'list', id: 'target', op: 'move', key: 'row' }, valid: true },
	{
		name: 'list removal',
		value: { type: 'list', id: 'target', op: 'remove', key: 'row' },
		valid: true
	},
	{ name: 'state', value: { type: 'state', id: 'target', value: { count: 1 } }, valid: true },
	{ name: 'replacement', value: { type: 'replace', id: 'target', html: '' }, valid: true },
	{ name: 'null patch', value: null, valid: false },
	{ name: 'primitive patch', value: 'patch', valid: false },
	{ name: 'array patch', value: [], valid: false },
	{ name: 'missing type', value: { id: 'target', value: '' }, valid: false },
	{ name: 'missing id', value: { type: 'text', value: '' }, valid: false },
	{ name: 'empty id', value: { type: 'text', id: '', value: '' }, valid: false },
	{ name: 'nonstring id', value: { type: 'text', id: 1, value: '' }, valid: false },
	{ name: 'unknown patch kind', value: { type: 'unknown', id: 'target' }, valid: false },
	{ name: 'nonstring text', value: { type: 'text', id: 'target', value: 1 }, valid: false },
	{ name: 'missing text', value: { type: 'text', id: 'target' }, valid: false },
	{
		name: 'unknown text field',
		value: { type: 'text', id: 'target', value: '', extra: true },
		valid: false
	},
	{
		name: 'nonstring property name',
		value: { type: 'prop', id: 'target', name: 1, value: null },
		valid: false
	},
	{
		name: 'missing property value',
		value: { type: 'prop', id: 'target', name: 'title' },
		valid: false
	},
	{
		name: 'undefined property value',
		value: { type: 'prop', id: 'target', name: 'title', value: undefined },
		valid: true
	},
	{
		name: 'unknown property field',
		value: { type: 'prop', id: 'target', name: 'title', value: '', extra: true },
		valid: false
	},
	{
		name: 'nonstring style name',
		value: { type: 'style', id: 'target', name: 1, value: '' },
		valid: false
	},
	{
		name: 'nonstring style value',
		value: { type: 'style', id: 'target', name: 'color', value: 1 },
		valid: false
	},
	{
		name: 'unknown style field',
		value: { type: 'style', id: 'target', name: 'color', value: '', extra: true },
		valid: false
	},
	{
		name: 'unknown list operation',
		value: { type: 'list', id: 'target', op: 'splice', key: 'row' },
		valid: false
	},
	{
		name: 'nonstring list key',
		value: { type: 'list', id: 'target', op: 'remove', key: 1 },
		valid: false
	},
	{
		name: 'nonstring list predecessor',
		value: { type: 'list', id: 'target', op: 'move', key: 'row', before: 1 },
		valid: false
	},
	{
		name: 'nonstring list html',
		value: { type: 'list', id: 'target', op: 'insert', key: 'row', html: 1 },
		valid: false
	},
	{
		name: 'unknown list field',
		value: { type: 'list', id: 'target', op: 'remove', key: 'row', extra: true },
		valid: false
	},
	{ name: 'missing state', value: { type: 'state', id: 'target' }, valid: false },
	{
		name: 'undefined state',
		value: { type: 'state', id: 'target', value: undefined },
		valid: true
	},
	{
		name: 'unknown state field',
		value: { type: 'state', id: 'target', value: {}, extra: true },
		valid: false
	},
	{
		name: 'nonstring replacement',
		value: { type: 'replace', id: 'target', html: 1 },
		valid: false
	},
	{
		name: 'unknown replacement field',
		value: { type: 'replace', id: 'target', html: '', extra: true },
		valid: false
	}
];

/** Ordered collection witnesses cover every operation and its required operands. */
export const collectionValidationCases: readonly OperationValidationCase[] = [
	{
		name: 'map set',
		value: { path: 'values', operation: 'map-set', key: 'key', value: { count: 1 } },
		valid: true
	},
	{
		name: 'map delete null key',
		value: { path: 'values', operation: 'map-delete', key: null },
		valid: true
	},
	{
		name: 'map delete boolean key',
		value: { path: 'values', operation: 'map-delete', key: false },
		valid: true
	},
	{
		name: 'map delete number key',
		value: { path: 'values', operation: 'map-delete', key: 0 },
		valid: true
	},
	{ name: 'map clear', value: { path: 'values', operation: 'map-clear' }, valid: true },
	{ name: 'set add', value: { path: 'values', operation: 'set-add', value: null }, valid: true },
	{
		name: 'set delete',
		value: { path: 'values', operation: 'set-delete', value: false },
		valid: true
	},
	{ name: 'set clear', value: { path: 'values', operation: 'set-clear' }, valid: true },
	{ name: 'null mutation', value: null, valid: false },
	{ name: 'primitive mutation', value: 'mutation', valid: false },
	{ name: 'array mutation', value: [], valid: false },
	{ name: 'missing path', value: { operation: 'map-clear' }, valid: false },
	{ name: 'nonstring path', value: { path: 1, operation: 'map-clear' }, valid: false },
	{ name: 'unknown mutation', value: { path: 'values', operation: 'unknown' }, valid: false },
	{ name: 'missing map key', value: { path: 'values', operation: 'map-delete' }, valid: false },
	{
		name: 'object map key',
		value: { path: 'values', operation: 'map-delete', key: {} },
		valid: false
	},
	{
		name: 'nonfinite map key',
		value: { path: 'values', operation: 'map-delete', key: Infinity },
		valid: false
	},
	{
		name: 'missing map value',
		value: { path: 'values', operation: 'map-set', key: 'key' },
		valid: false
	},
	{
		name: 'unknown map set field',
		value: { path: 'values', operation: 'map-set', key: 'key', value: 1, extra: true },
		valid: false
	},
	{
		name: 'unknown map delete field',
		value: { path: 'values', operation: 'map-delete', key: 'key', extra: true },
		valid: false
	},
	{
		name: 'unknown map clear field',
		value: { path: 'values', operation: 'map-clear', extra: true },
		valid: false
	},
	{
		name: 'unknown set clear field',
		value: { path: 'values', operation: 'set-clear', extra: true },
		valid: false
	},
	{ name: 'missing set value', value: { path: 'values', operation: 'set-add' }, valid: false },
	{
		name: 'unknown set field',
		value: { path: 'values', operation: 'set-delete', value: false, extra: true },
		valid: false
	}
];
