package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedCallableProof binds detached construction provenance. Only completed
// source population finalizes its recipe/map for a separate live entry handoff.
type closedCallableProof struct {
	// Capture layout is source proof only. Actual CellIds are acquired at creation.
	captureDeclarations []*ast.Node
	captureReferences   map[*ast.Node]int

	plan       *closedBodyPlan
	mapping    *closedParameterMap
	source     *ast.SourceFile
	namespace  *languageOwner
	generation uint64

	entry      *storageRecipe // optional detached parameter/body schedule, not creation authority
	arrow      *ast.Node
	parameters int
	empty      bool
}

// languageCallable owns a fresh identity and authenticated defining environment.
// Empty-capture callables keep their separate environment. The finite module
// capture mode retains original CellIds in the actual defining environment.
type languageCallable struct {
	// These are actual defining cells, never copied values or source-name lookup.
	capturedLexicals []languageLexical

	id       languageID
	proof    *closedCallableProof
	captures *languageEnvironment
}
type languageLexical struct {
	declaration *ast.Node
	cell        languageCell
}
type languageCallArgument struct {
	value         languageValue
	input, output languageBranch
}

// languageCallInputs is detached immutable acquired history. Complete is false
// at every acquisition cut, including a cut before any argument is available.
type languageCallInputs struct {
	bindingSite           *bindingCallSite
	valueOrigin           *languageCallValueOrigin
	category              languageCallTargetCategory
	targetOrigin          *languageCallTargetOrigin
	call                  *ast.Node
	callee                languageValue
	calleeBranch          languageBranch
	reference             languageReference
	receiver              languageValue
	calleeReady, complete bool
	arguments             []languageCallArgument
	lexicals              []languageLexical
}

func copyLanguageCallInputs(v *languageCallInputs) *languageCallInputs {
	if v == nil {
		return nil
	}
	out := *v
	out.lexicals = append([]languageLexical(nil), v.lexicals...)
	out.arguments = append([]languageCallArgument(nil), v.arguments...)
	return &out
}
func sameLanguageCallInputs(a, b *languageCallInputs) bool {
	if a == nil || b == nil {
		return a == b
	}
	if !sameCallValueOrigin(a.valueOrigin, b.valueOrigin) || a.category != b.category || !sameCallTargetOrigin(a.targetOrigin, b.targetOrigin) || a.reference != b.reference || a.receiver != b.receiver || a.call != b.call || a.callee != b.callee || a.calleeBranch != b.calleeBranch || a.calleeReady != b.calleeReady || a.complete != b.complete || len(a.arguments) != len(b.arguments) {
		return false
	}
	if len(a.lexicals) != len(b.lexicals) {
		return false
	}
	for i, v := range a.lexicals {
		if v != b.lexicals[i] {
			return false
		}
	}
	for i, v := range a.arguments {
		if v != b.arguments[i] {
			return false
		}
	}
	return true
}

// storageScheduleSetup bounds activation buffers and cut snapshots before root
// publication. Per-event history and storage scans are additionally metered.
func storageScheduleSetup(r *storageRecipe) int {
	return r.locals*3 + r.registers*5 + 16
}
func (o *languageOwner) createClosedCallable(b languageBranch, p *closedCallableProof) languageAlternative {
	if !o.canAdvance(b, 3) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if !o.live(b) || p == nil || !p.empty || !closedCallableNode(p.arrow) || ast.IsFunctionDeclaration(p.arrow) {
		return storageResidual(b, "closed callable proof unavailable")
	}
	f := &languageCallable{id: o.identity(), proof: p, captures: o.environment(nil)}
	return languageAlternative{branch: o.storageStep(b, languageStorage{}), value: languageValue{callable: f, node: p.arrow}}
}

// putLocal uses the same persistent initialized-cell storage as declarations.
// Missing initialization is TDZ, rather than an implicit undefined value.
func (o *languageOwner) putLocal(b languageBranch, c languageCell, v languageValue) languageAlternative {
	if !o.canAdvance(b, 1) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if !o.live(b) || c.id.owner != o || c.summary || c.environment != b.env.id {
		return storageResidual(b, "PutValue lexical ownership")
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == c && row.initialized {
			if c.immutable {
				return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}
			}
			return languageAlternative{branch: o.storageStep(b, languageStorage{cell: c, value: v, initialized: true}), value: v}
		}
	}
	return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "ReferenceError"}}
}

// closedCallableNode names admitted source kinds, never permission for body entry.
// Ordinary functions are strict external-module anonymous non-generators.
func closedCallableNode(n *ast.Node) bool {
	if n == nil {
		return false
	}
	if moduleFunctionDeclaration(n) {
		return true
	}
	if ast.IsArrowFunction(n) {
		return true
	}
	if ast.IsGetAccessorDeclaration(n) {
		return !ast.HasSyntacticModifier(n, ast.ModifierFlagsStatic|ast.ModifierFlagsAsync) && !ast.HasDecorators(n) && len(n.Parameters()) == 0 && ast.IsExternalModule(ast.GetSourceFileOfNode(n))
	}
	return ast.IsFunctionExpression(n) && n.Name() == nil && n.AsFunctionExpression().AsteriskToken == nil && !ast.HasSyntacticModifier(n, ast.ModifierFlagsAsync) && ast.IsExternalModule(ast.GetSourceFileOfNode(n))
}
