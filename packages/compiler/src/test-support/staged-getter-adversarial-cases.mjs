/**
 * Ordinary getter evaluation recipes for TestGetterAdversarialEmission.
 * The native test compiles each source on both targets and runs its oracle in
 * a fresh Node process. Component placement and setup effects are exercised in
 * getter-call-placement.test.ts.
 */
export const stagedGetterAdversarialCases = [
	{
		name: 'throwing-get-before-call',
		source: `export function entry(){const table={get run():()=>string{window.name;throw new Error('get-stop');}};return table.run();}`,
		oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};assert.throws(()=>m.entry(),/get-stop/);assert.deepEqual(events,['get']);`
	},
	{
		name: 'dormant-throwing-returned-callback',
		source: `export function entry(){const table={get run(){window.name;return()=>{document.title;throw new Error('call-stop');};}};return table.run;}`,
		oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};globalThis.document={get title(){events.push('call');return 'title'}};const saved=m.entry();assert.deepEqual(events,['get']);assert.throws(()=>saved(),/call-stop/);assert.deepEqual(events,['get','call']);`
	},
	{
		name: 'saved-callable-container-replacement',
		source: `export function entry(){let table={get run(){window.name;return()=>document.title;}};const saved=table.run;table={get run(){return()=> 'replacement';}};return saved();}`,
		oracle: `const events=[];globalThis.window={get name(){events.push('original-get');return 'name'}};globalThis.document={get title(){events.push('original-call');return 'original'}};assert.equal(m.entry(),'original');assert.deepEqual(events,['original-get','original-call']);`
	},
	{
		name: 'ordinary-receiver-versus-detached-call',
		source: `export function member(){const table={label:'member',get run(){window.name;return function(this:{label:string}|void){return this===undefined?'detached':this.label;};}};return table.run();}
export function detached(){const table={label:'member',get run(){window.name;return function(this:{label:string}|void){return this===undefined?'detached':this.label;};}};const saved=table.run;return saved();}`,
		oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};assert.equal(m.member(),'member');assert.equal(m.detached(),'detached');assert.deepEqual(events,['get','get']);`
	},
	{
		name: 'unknown-sibling-after-known-invocation',
		source: `declare function foreign():void;export function entry(){const table={get run(){window.name;return()=>document.title;}};const saved=table.run;const result=saved();foreign();return result;}`,
		oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};globalThis.document={get title(){events.push('call');return 'title'}};globalThis.foreign=()=>{events.push('foreign');throw new Error('foreign-stop')};assert.throws(()=>m.entry(),/foreign-stop/);assert.deepEqual(events,['get','call','foreign']);`
	}
];
