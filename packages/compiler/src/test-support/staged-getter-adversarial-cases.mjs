/**
 * Source-produced adjacent controls for the staged getter migration.
 * These are recipes, not executed compiler acceptance. Feed each source unchanged
 * to NewSession().Execute with Kind analyze and Diagnostics semantic. Reject
 * response.Error and error diagnostics, then inspect the named executable's
 * EffectSources by Environment and Description, preserving independent unknown.
 * For emitted acceptance compile each source on TargetClient and TargetServer,
 * require nonempty Code, write a temporary .mts and execute oracle after import
 * using Node's type stripping, as in TestGetterExposureEmittedBaseline.
 * The oracle installs host globals before import and must run in a fresh process.
 * TS7 strict checking qualifies source syntax/types only.
 *
 * Native migration guards must use the original Get/Call source occurrences:
 * require connected producer, exposure consumer and settled publication with no
 * legacy recovery only for the declared migrated domain. A public effect match
 * alone is insufficient. Legacy controls must retain an explicit recovery reason
 * for their excluded operation, not demand a new-subset receipt. Do not assert
 * a successful Get result on a throwing path or equate MAY effects with execution.
 */
export const stagedGetterAdversarialCases = [
  {
    name: 'throwing-get-before-call',
    domain: 'getter candidate, abrupt completion remains independently owned',
    source: `export function entry(){const table={get run():()=>string{window.name;throw new Error('get-stop');}};return table.run();}`,
    analysis: { entry: { required: ['window'], absent: ['document'], unknown: false } },
    guard: 'At the original table.run Get retain the getter dependency. The following Call cannot acquire successful exposure from Throw. Require no legacy only if this abrupt getter domain is explicitly migrated.',
    oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};assert.throws(()=>m.entry(),/get-stop/);assert.deepEqual(events,['get']);`
  },
  {
    name: 'dormant-throwing-returned-callback',
    domain: 'getter candidate, callback body dormant',
    source: `export function entry(){const table={get run(){window.name;return()=>{document.title;throw new Error('call-stop');};}};return table.run;}`,
    analysis: { entry: { required: ['window'], absent: ['document'], unknown: false } },
    guard: 'At the original table.run Get require connected exposure without callback body activation or legacy recovery in the migrated receiver-free getter domain. Merely creating the throwing callback contributes neither its donor nor a performed Throw.',
    oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};globalThis.document={get title(){events.push('call');return 'title'}};const saved=m.entry();assert.deepEqual(events,['get']);assert.throws(()=>saved(),/call-stop/);assert.deepEqual(events,['get','call']);`
  },
  {
    name: 'saved-callable-container-replacement',
    domain: 'legacy write and capture selection',
    source: `export function entry(){let table={get run(){window.name;return()=>document.title;}};const saved=table.run;table={get run(){return()=> 'replacement';}};return saved();}`,
    analysis: { entry: { required: ['window', 'document'], absent: [] } },
    guard: 'Keep write/capture recovery explicitly legacy. Require the saved callable donor to survive container replacement, without demanding a staged write receipt or absence of legacy uncertainty.',
    oracle: `const events=[];globalThis.window={get name(){events.push('original-get');return 'name'}};globalThis.document={get title(){events.push('original-call');return 'original'}};assert.equal(m.entry(),'original');assert.deepEqual(events,['original-get','original-call']);`
  },
  {
    name: 'ordinary-receiver-versus-detached-call',
    domain: 'legacy receiver binding',
    source: `export function member(){const table={label:'member',get run(){window.name;return function(this:{label:string}|void){return this===undefined?'detached':this.label;};}};return table.run();}
export function detached(){const table={label:'member',get run(){window.name;return function(this:{label:string}|void){return this===undefined?'detached':this.label;};}};const saved=table.run;return saved();}`,
    analysis: { member: { required: ['window'], absent: ['document'] }, detached: { required: ['window'], absent: ['document'] } },
    guard: 'Both receiver-dependent routes remain explicit legacy negatives for the current subset. Never bind the detached Call to the earlier Get receiver or require new-subset receiver receipts.',
    oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};assert.equal(m.member(),'member');assert.equal(m.detached(),'detached');assert.deepEqual(events,['get','get']);`
  },
  {
    name: 'unknown-sibling-after-known-invocation',
    domain: 'getter/callback candidate plus independent unresolved Call',
    source: `declare function foreign():void;export function entry(){const table={get run(){window.name;return()=>document.title;}};const saved=table.run;const result=saved();foreign();return result;}`,
    analysis: { entry: { required: ['window', 'document'], absent: [], unknown: true } },
    guard: 'Require known getter and invoked callback donors beside unknown. Check no legacy at migrated Get and saved Call occurrences only. The separate foreign Call retains its unresolved disposition and must not be discharged by their coverage.',
    oracle: `const events=[];globalThis.window={get name(){events.push('get');return 'name'}};globalThis.document={get title(){events.push('call');return 'title'}};globalThis.foreign=()=>{events.push('foreign');throw new Error('foreign-stop')};assert.throws(()=>m.entry(),/foreign-stop/);assert.deepEqual(events,['get','call','foreign']);`
  }
];
