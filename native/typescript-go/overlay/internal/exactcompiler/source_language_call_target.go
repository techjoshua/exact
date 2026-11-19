package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Target category describes evaluation, not the syntax that once produced a value.
type languageCallTargetCategory uint8

const (
	callTargetUnavailable languageCallTargetCategory = iota
	callReferenceTarget
	callValueTarget
)

// languageCallTargetOrigin retains an issued callee selection. Nil getterInstall
// proves ordinary successful Get. The implicit getter role instead retains the
// selected descriptor before property Get completes, never a fabricated Get.
type languageCallTargetOrigin struct {
	getterInstall                 *languageStorage // immutable selected own accessor row, nil for ordinary callee Get
	recipe                        *storageRecipe
	referencePC, getPC, acquirePC int
	reference                     languageReference
	input, output                 languageBranch
	value                         languageValue
}

func sameCallTargetOrigin(a, b *languageCallTargetOrigin) bool {
	return a == b || a != nil && b != nil && *a == *b
}

// validCallTarget authenticates the acquired reference, successful Get and
// callee event wiring on the same live owner and branches. Receiver selection
// uses the retained reference, never a binding reread after argument evaluation.
func validCallTarget(o *languageOwner, in *languageCallInputs) bool {
	if in != nil && in.category == callValueTarget {
		return validCallValueTarget(o, in)
	}
	if o == nil || in == nil || in.category != callReferenceTarget || in.valueOrigin != nil || in.targetOrigin == nil {
		return false
	}
	t := in.targetOrigin
	r := t.recipe
	if t.getterInstall != nil {
		return validOwnGetterTarget(o, in)
	}
	if r == nil || t.referencePC < 0 || t.referencePC >= len(r.events) || t.getPC < 0 || t.getPC >= len(r.events) || t.acquirePC < 0 || t.getPC <= t.referencePC || t.acquirePC != t.getPC+1 || t.acquirePC >= len(r.events) || !o.live(t.input) || !o.live(t.output) || t.output != in.calleeBranch || t.value != in.callee || t.reference != in.reference || t.reference.id.owner != o {
		return false
	}
	ref, get, acquire := r.events[t.referencePC], r.events[t.getPC], r.events[t.acquirePC]
	if ref.out != t.referencePC || (ref.kind != "Member" && ref.kind != "ResolveLexicalReference") || get.kind != "GetValue" || get.a != ref.out || get.out != t.getPC || acquire.kind != "AcquireCallCallee" || acquire.node != in.call || acquire.a != get.out || acquire.b != ref.out {
		return false
	}
	if ref.kind == "Member" {
		return in.reference.cell.id.owner == nil && in.receiver == in.reference.receiver && in.receiver.object != nil
	}
	return in.reference.cell.id.owner == o && in.receiver == (languageValue{undefined: true})
}

// scanOwnedObjectCompletion shares only allocation and producing-prefix ancestry.
// Each producer caller authenticates its own anchor. Environments may differ.
func scanOwnedObjectCompletion(source *ast.SourceFile, anchor languageBranch, row languageAlternative, w *languageCopyWork) bool {
	if source == nil || row.branch.owner == nil || !row.branch.owner.live(anchor) || anchor.owner != row.branch.owner || anchor.guard != row.branch.guard || row.value.object == nil || row.value.object.id.owner != row.branch.owner {
		return false
	}
	object := row.value.object
	if !allocatedLanguageObject(row.branch, object, w) {
		return false
	}
	ancestor := func(older, newer *languageState) bool {
		for s := newer; s != nil; s = s.previous {
			if !w.spend(1) {
				return false
			}
			if s == older {
				return true
			}
		}
		return false
	}
	for i := range row.objects {
		if !w.spend(1) {
			return false
		}
		h := row.objects[i]
		if h.recipe == nil || !h.recipe.prefix || h.reference != (languageID{}) || h.recipe.body != source.AsNode() || h.receipt == nil || h.pc < 0 || h.pc >= len(h.recipe.events) || len(h.receipt.alternatives) != 1 {
			continue
		}
		ev := h.recipe.events[h.pc]
		a := h.receipt.alternatives[0]
		if ev.kind != "ObjectComplete" || ev.node != h.node || ev.a < 0 || ev.a >= h.pc || h.recipe.events[ev.a].kind != "AllocateObject" || h.recipe.events[ev.a].node != h.node || a.value.object != object || a.completion != languageNormal || !row.branch.owner.live(a.branch) || a.branch.guard != row.branch.guard || h.receipt.input != a.branch {
			continue
		}
		if ancestor(a.branch.state, anchor.state) && ancestor(anchor.state, row.branch.state) {
			return true
		}
	}
	return false
}

// Implicit getters acquire the callee from [[Get]], not the result of GetValue.
// The executor issues this association from its single descriptor selection.
// Validate the frozen installation pointer and role, never reread descriptors.
func validOwnGetterTarget(o *languageOwner, in *languageCallInputs) bool {
	if o == nil || in == nil || in.category != callReferenceTarget || in.bindingSite != nil || in.valueOrigin != nil || in.targetOrigin == nil {
		return false
	}
	t := in.targetOrigin
	r := t.recipe
	row := t.getterInstall
	if row == nil || r == nil || !r.prefix || r.callBody || t.acquirePC != -1 || t.referencePC < 0 || t.getPC <= t.referencePC || t.getPC >= len(r.events) || t.input != t.output || !o.live(t.input) || t.output != in.calleeBranch || t.reference.id.owner != o || t.reference.cell.id.owner != nil || t.reference.receiver.object == nil || t.reference != in.reference || in.receiver != t.reference.receiver || in.callee != t.value || !getterDescriptorPayload(row.descriptor) || !row.initialized || row.deleted || row.object != in.receiver.object || row.key != in.reference.key || row.descriptor.value != in.callee || len(in.arguments) != 0 {
		return false
	}
	ref, get := r.events[t.referencePC], r.events[t.getPC]
	bindingSource, bindingRole := bindingGetterSourceRegister(r, t.getPC)
	return ref.kind == "Member" && ref.out == t.referencePC && get.kind == "GetValue" && get.a == t.referencePC && get.out == t.getPC && get.node == in.call && ((r.binding == nil && (ast.IsPropertyAccessExpression(in.call) || ast.IsElementAccessExpression(in.call))) || (bindingRole && in.call == r.binding.declaration && ref.node == r.binding.declaration && ref.a == bindingSource)) && ownGetterInstallationKey(row)
}

func ownGetterInstallationKey(row *languageStorage) bool {
	if row == nil || !getterDescriptorPayload(row.descriptor) {
		return false
	}
	node := row.descriptor.value.callable.proof.arrow
	return node.Name() != nil && !ast.IsComputedPropertyName(node.Name()) && row.key == languageStringKey(node.Name().Text())
}
