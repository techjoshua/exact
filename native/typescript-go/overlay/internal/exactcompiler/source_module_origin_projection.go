package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// moduleInitializerCapture retains an actual formal's source origin, not its
// mutable object's contents. Later effect demands use their current boundary.
// No installed input, observation, cell or runtime identity survives publication.
type moduleInitializerCapture struct {
	Formal, Actual, Origin *ast.Node
}

// moduleInitializerOriginFamily is metadata-only provenance born from a complete
// original Call. Distinct Calls retain distinct captures even for one return AST.
// It cannot fulfill a normal value, Get, Call target or descriptor obligation.
type moduleInitializerOriginFamily struct {
	Call, Body, Returned, Origin *ast.Node
	Captures                     []moduleInitializerCapture
}

func moduleOriginMode(owner *sourceValueOwner, source *ast.SourceFile) [32]byte {
	if h := owner.closedPrefixes[source]; h != nil {
		return h.mode
	}
	if p := owner.closedPrefixCandidate; p != nil && p.source == source && p.history != nil {
		return p.history.mode
	}
	return [32]byte{}
}

// detachedModuleLiteral accepts only an actually acquired literal allocation.
// Its static inventory restricts this projection domain, never proves a Get or
// immutable contents. The accessor/current-write owners still own each demand.
func detachedModuleLiteral(node *ast.Node) bool {
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return false
	}
	audit := ownGetterAudit{remaining: 4096}
	return audit.eagerLiteral(node)
}

// detachModuleCallOrigins runs before ordinary result cleanup, while the original
// frame is live. Every raw alternative must be complete and every capture must
// retain its authentic formal/actual association. Refusal publishes nothing.
func detachModuleCallOrigins(fact *callableFacts, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || fact.initializerDraft != nil || fact.normalInputs == nil {
		return
	}
	v := owner.values
	call := moduleCallInitializer(v, fact.node)
	if call == nil || fact.normalInputs.declaration != fact.node || fact.normalInputs.operationLifetime == nil {
		return
	}
	slot := fact.normalInputs.operations[call]
	if slot == nil || slot.state != sourceOperationConsumed || !slot.selectionComplete || !slot.authority.valid(&sourceValueQuery{owner: v, executable: owner}) {
		return
	}
	declaration := moduleInitializerDeclaration(v, fact.node)
	if declaration == nil {
		return
	}
	var families []moduleInitializerOriginFamily
	for _, receipt := range fact.normalCalls {
		if receipt == nil || receipt.operation != call {
			continue
		}
		if receipt.owner != nil || receipt.frame != fact.normalInputs || !receipt.entered || receipt.async || receipt.construction || receipt.raw.incomplete || receipt.raw.effects != sourceEffectsAccounted || len(receipt.raw.values) == 0 {
			return
		}
		body := receipt.declaration
		if body == nil || !ast.IsFunctionDeclaration(body) || enclosingCallableNode(body) != nil || ast.GetSourceFileOfNode(body) != fact.sourceFile || ast.HasSyntacticModifier(body, ast.ModifierFlagsAsync) || body.AsFunctionDeclaration().AsteriskToken != nil {
			return
		}
		actuals := call.AsCallExpression().Arguments
		if actuals == nil || len(actuals.Nodes) != len(body.Parameters()) {
			return
		}
		for _, observed := range receipt.raw.values {
			if observed.inputs == nil || observed.inputs.declaration != body || observed.inputs.invocation != call || observed.returned == nil || enclosingCallableNode(observed.returned) != body || !detachedModuleLiteral(observed.value.node) || len(observed.value.path) != 0 || observed.value.acquired != nil || observed.value.normal != nil || observed.value.instance != nil || len(observed.scope.bindings) != len(body.Parameters()) {
				return
			}
			family := moduleInitializerOriginFamily{Call: call, Body: body, Returned: observed.returned, Origin: observed.value.node}
			for i, formal := range body.Parameters() {
				if !ast.IsIdentifier(formal.Name()) || formal.Initializer() != nil || formal.AsParameterDeclaration().DotDotDotToken != nil {
					return
				}
				symbol := v.checker.GetSymbolAtLocation(formal.Name())
				if symbol == nil || symbol.ValueDeclaration != formal || v.bindingWritten(symbol) {
					return
				}
				values := observed.scope.bindings[ast.GetSymbolId(symbol)]
				if len(values) != 1 {
					return
				}
				value := values[0]
				actual := value.acquired
				if actual == nil || actual.inputs != receipt.frame || actual.returned != nil || actual.value.node != value.node || len(actual.value.path) != 0 || len(value.path) != 0 || value.normal != nil || value.instance != nil || !detachedModuleLiteral(value.node) || ast.GetSourceFileOfNode(value.node) != fact.sourceFile || len(actual.scope.bindings) != 0 || len(actual.scope.creators) != 0 {
					return
				}
				family.Captures = append(family.Captures, moduleInitializerCapture{Formal: formal, Actual: actuals.Nodes[i], Origin: value.node})
			}
			families = append(families, family)
		}
	}
	if len(families) == 0 {
		return
	}
	d := &moduleInitializerDraft{Source: fact.sourceFile, Statement: fact.node, Declaration: declaration, Program: v.program, Checker: v.checker, FactID: fact.summary.ID, Stamp: initializerSourceStamp(fact.sourceFile), Mode: "CallEffectOrigin", Status: "AwaitingGraph", Origins: families, OriginGeneration: v.generation, OriginMode: fact.descriptorMode}
	d.signature = moduleOriginSignature(d)
	fact.initializerDraft = d
	installAwaitingInitializer(v, d)
}

// moduleCallEffectOrigins lends only sealed metadata to the module's effect-only
// read traversal. Neither a normal producer nor an invocation can consume it.
func (query *sourceValueQuery) moduleCallEffectOrigins(call *ast.Node) []moduleInitializerOriginFamily {
	v := query.owner
	if v == nil || v.generation == nil || !v.generation.active || query.inputs != nil || query.effectOwner != nil || query.moduleRead() == nil || !ast.IsCallExpression(call) {
		return nil
	}
	outer := call.Parent
	if outer == nil || !ast.IsVariableDeclaration(outer) || outer.Initializer() != call {
		return nil
	}
	p := v.initializerDeclarations[outer]
	if p == nil || !p.Sealed || p.Draft == nil {
		return nil
	}
	d := p.Draft
	if d.Mode != "CallEffectOrigin" || d.Declaration != outer || d.Source != ast.GetSourceFileOfNode(call) || d.Program != v.program || d.Checker != v.checker || d.OriginGeneration != v.generation || d.OriginMode != moduleOriginMode(v, d.Source) || d.Stamp != initializerSourceStamp(d.Source) || query.moduleRead().Pos() <= call.End() || ast.GetSourceFileOfNode(query.moduleRead()) != d.Source {
		return nil
	}
	if moduleCallInitializer(v, d.Statement) != call {
		return nil
	}
	for _, family := range d.Origins {
		if family.Call != call || family.Body == nil || !ast.IsFunctionDeclaration(family.Body) || family.Returned == nil || family.Origin == nil || ast.GetSourceFileOfNode(family.Body) != d.Source || ast.GetSourceFileOfNode(family.Origin) != d.Source || ast.GetSourceFileOfNode(family.Returned) != d.Source || enclosingCallableNode(family.Origin) != family.Body || enclosingCallableNode(family.Returned) != family.Body {
			return nil
		}
		if len(family.Captures) != len(family.Body.Parameters()) || call.AsCallExpression().Arguments == nil || len(family.Captures) != len(call.AsCallExpression().Arguments.Nodes) {
			return nil
		}
		for i, capture := range family.Captures {
			if capture.Formal == nil || capture.Formal != family.Body.Parameters()[i] || capture.Formal.Parent != family.Body || capture.Actual == nil || capture.Actual != call.AsCallExpression().Arguments.Nodes[i] || capture.Origin == nil || ast.GetSourceFileOfNode(capture.Origin) != d.Source || !detachedModuleLiteral(capture.Origin) {
				return nil
			}
			symbol := v.checker.GetSymbolAtLocation(capture.Formal.Name())
			if symbol == nil || symbol.ValueDeclaration != capture.Formal || v.bindingWritten(symbol) {
				return nil
			}
		}
	}
	if d.signature != moduleOriginSignature(d) || p.Signature != initializerHash([]string{d.signature, p.DependencySignature}) {
		return nil
	}
	return d.Origins
}

// moduleOriginSignature binds copied containers and source keys without addresses.
func moduleOriginSignature(d *moduleInitializerDraft) string {
	keys := []int{}
	for _, family := range d.Origins {
		keys = append(keys, family.Call.Pos(), family.Body.Pos(), family.Returned.Pos(), family.Origin.Pos())
		for _, capture := range family.Captures {
			keys = append(keys, capture.Formal.Pos(), capture.Actual.Pos(), capture.Origin.Pos())
		}
	}
	return initializerHash([]interface{}{d.Mode, d.Stamp, d.OriginMode, keys})
}

// staleModuleOriginCache requires genuine recollection after request-generation
// turnover. Re-stamping an old origin could renew a discarded construction.
func staleModuleOriginCache(cache *projectCallableCache, generation *projectGeneration) bool {
	if cache == nil {
		return false
	}
	for _, analysis := range cache.bySource {
		for _, fact := range analysis.facts {
			if d := fact.initializerDraft; d != nil && (len(d.Origins) != 0 || len(d.PossibleProxyGets) != 0) && d.OriginGeneration != generation {
				return true
			}
		}
	}
	return false
}
