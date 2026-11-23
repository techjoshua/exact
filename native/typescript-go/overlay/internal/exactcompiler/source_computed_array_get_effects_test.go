package exactcompiler

import "testing"

// A validator's computed Get can select an authored array element getter.
// The task publishes the validated result and cannot run on the server.
func TestComputedArrayGetterTaskPlacement(t *testing.T) {
	const source = `function observe(values:readonly number[]):number {
        if (!Array.isArray(values)) throw new Error('wrong receiver');
        let sum=0;
        for (let index=0; index<values.length;index++) {
            const number=values[index];
            if (!Number.isFinite(number)) throw new Error('invalid');
            sum+=number;
        }
        return sum;
    }`
	const body = `const values=[0.02];
        Object.defineProperty(values,'0',{get(){return document.title.length}});
        this.state.label=String(observe(values));`
	checkPendingConstructionTaskBody(t, source, body, true, true)
}
