package exactcompiler

const callMigrationID = "/virtual/call-migration.ts"
const callMigrationSource = `const first=(a:number,b:number)=>a;
const replacement=(a:number,b:number)=>b;
let chosen=first;let n=0;
chosen((chosen=replacement,n=3),(n=4));export{};`
const callMigrationReplacement = `const first=(a:number,b:number)=>b;
const replacement=(a:number,b:number)=>b;
let chosen=first;let n=0;
chosen((chosen=replacement,n=3),(n=4));export{};`
const callMigrationMethod = `export {};
const f=function(this:{value:number},a:number){return this.value;};
const holder={value:3,run:f};(holder.run)(1);`
