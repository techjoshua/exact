/** Authored source shared by adapter diagnostics and the mount, SSR and hydration journey. */
export const callablePropertyFixture =
	'function source(){return 0}\nsource.run=()=>0;\nconst box={member:source};\nconst saved=box.member;\nsaved.run=()=>document.title.length;\nexport function selectedProbe(){return saved.run()}\nexport function Page(){\n const direct=saved();\n const kind=typeof saved.run;\n return ()=> <p data-callable-property>{direct}:{kind}</p>;\n}\nexport const callablePropertyRoot=()=> <Page/>;\n';
