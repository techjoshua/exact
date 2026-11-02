package exactcompiler

const activationCaptureSource = `export{};function make(input:{value:string}){return()=>input.value}const input={value:'safe'};const selected=make(input);`
