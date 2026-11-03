/**
 * Consumer overlays for the unchanged sibling component module. Only this module
 * varies between cases, so its initialization cannot become a component default.
 */
export const componentInputInvarianceConsumers = {
	namedBrowser: `
import { ComponentInputInvariance, type ComponentInputInvarianceProps } from './component-input-invariance.fixtures.js';
type ReadReceiver = ComponentInputInvarianceProps;
const captured = 'captured';
function read(this: ReadReceiver, suffix: string) {
 return this.label + suffix + captured + document.title;
}
export function Parent() {
 return () => <ComponentInputInvariance label="browser" read={read} />;
}`,
	namedSafe: `
import { ComponentInputInvariance, type ComponentInputInvarianceProps } from './component-input-invariance.fixtures.js';
type ReadReceiver = ComponentInputInvarianceProps;
const captured = 'captured';
function read(this: ReadReceiver, suffix: string) {
 return this.label + suffix + captured;
}
export function Parent() {
 return () => <ComponentInputInvariance label="safe" read={read} />;
}`,
	dormantBrowser: `
import { DormantComponentInputInvariance } from './component-input-invariance-dormant.fixtures.js';
import type { ComponentInputInvarianceProps } from './component-input-invariance.fixtures.js';
type ReadReceiver = ComponentInputInvarianceProps;
function read(this: ReadReceiver, suffix: string) {
 return this.label + suffix + document.title;
}
export function Parent() {
 return () => <DormantComponentInputInvariance label="dormant" read={read} />;
}`,
	namedSpellingBrowser: `
import { ComponentInputInvariance, type ComponentInputInvarianceProps } from './component-input-invariance.fixtures.js';
function read(this: ComponentInputInvarianceProps, suffix: string) {
 return this.label + suffix + document.title;
}
export function Parent() {
 return () => <ComponentInputInvariance label="browser" read={read} />;
}`,
	unobserved: `export const unrelated = 'ready';`,
	safe: `
import { ComponentInputInvariance } from './component-input-invariance.fixtures.js';
export function Parent() {
 return () => <ComponentInputInvariance label="safe" read={function(suffix) { return this.label + suffix; }} />;
}`,
	browser: `
import { ComponentInputInvariance } from './component-input-invariance.fixtures.js';
export function Parent() {
 return () => <ComponentInputInvariance label="browser" read={function(suffix) { return this.label + suffix + document.title; }} />;
}`,
	mutable: `
import { ComponentInputInvariance, type ComponentInputInvarianceProps } from './component-input-invariance.fixtures.js';
export const input: ComponentInputInvarianceProps = {
 label: 'first',
 read(suffix) { return this.label + suffix; }
};
export function replaceRead() {
 input.read = function(suffix) { return this.label + ':' + suffix; };
}
export function Parent() {
 return () => <ComponentInputInvariance label={input.label} read={input.read} />;
}`
} as const;
