import { createInstalledThemeFixture } from './installed-theme.js';

/** Publishes a transparent context provider whose children belong to the server. */
export async function createInstalledProviderFixture() {
	return await createInstalledThemeFixture('library', 'enabled', false, {
		source: `import {createContext, peek, type Component, type Child} from '@exactjs/core';
import {_} from '@exactjs/jsx';
const typography={display:'Georgia',body:'system-ui',code:'monospace'};
const Control=createContext<{appearance:string;choose:()=>void}>('retained-theme-control');
export function Provider(this:Component<{appearance:'light'|'dark'}>,props:{appearance:'light'|'dark'; children?:Child; cookieName?:string}){
 this.state.appearance=peek(()=>props.appearance); const state=this.state;
 this.setContext(Control,{get appearance(){return state.appearance},choose(){state.appearance=state.appearance==='light'?'dark':'light';document.cookie=props.cookieName+'='+state.appearance}});
 return()=> <_ theme:scope theme:appearance={this.state.appearance} theme:tonic="#0B5C56" theme:temperament="stark" theme:typography={typography}>{props.children}</_>;
}
export function Toggle(this:Component<object>){const control=this.getContext(Control);return()=> <button onClick={()=>control.choose()}>{control.appearance}</button>;}
/** @exact server */
export function Page(){return()=> <main><Provider appearance="light"><section><Toggle/><p data-retained>Retained content</p></section></Provider></main>;}`,
		components: ['Page', 'Provider', 'Toggle'],
		sideEffects: ['*.css']
	});
}
