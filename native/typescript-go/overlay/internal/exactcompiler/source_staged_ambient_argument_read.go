package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"github.com/microsoft/TypeScript/tsc/internal/tsoptions"
	"slices"
)

// sourceAmbientArgumentReference caches immutable source classification only.
// It has no original Call use, graph identity, subscriber or execution receipt.
// An owner can refresh its generation; every cache lookup checks all inputs.
type sourceAmbientArgumentReference struct {
	node, declaration *ast.Node
	symbol            *ast.Symbol
	source            *ast.SourceFile
	program           *compiler.Program
	checker           *checker.Checker
	config            *tsoptions.ParsedCommandLine
	generation        *projectGeneration
	effects           []EnvironmentEffectSource // Immutable, with an empty owner path prefix.
	contexts          []ContextEffect
}

// One owner cache holds only one exact compiler context. Replacing its header
// on generation/configuration changes also bounds retained AST keys after edits.
type sourceAmbientArgumentReferences struct {
	generation *projectGeneration
	program    *compiler.Program
	checker    *checker.Checker
	config     *tsoptions.ParsedCommandLine
	entries    map[*ast.Node]*sourceAmbientArgumentReference
}

// sourceAmbientArgumentRead is freshly described at the owning ordinary Call.
// This conditional MAY contribution gives no value, Normal, Get or binder fact.
// The existing reached-Call, BODY and required-input gates remain independent.
type sourceAmbientArgumentRead struct {
	reference             *sourceAmbientArgumentReference
	call, argument, owner *ast.Node
	ordinal               int
	cut                   sourceRelativeCut
	ownerName             string // Diagnostic path only, never operation identity.
}

// ambientArgumentReferenceCurrent checks semantic cache inputs only; it is
// never a subscriber, executed-read or output-currentness receipt.
func ambientArgumentReferenceCurrent(r *sourceAmbientArgumentReference, owner *executableBodyOwner, source *ast.SourceFile) bool {
	if r == nil || owner == nil || owner.values == nil || owner.project == nil {
		return false
	}
	g := owner.values.generation
	return installedMemberGenerationActive(g) && r.generation == g && r.source == source && r.program == g.program && r.program == owner.values.program && r.checker == g.checker && r.checker == owner.checker && r.checker == owner.values.checker && r.config == owner.project.config && g.project == owner.project && !owner.values.bindingWritten(r.symbol)
}

// sourceCallArgumentReferenceEffects shares the original bound reference
// classifier. Only a direct Identifier actual of this ordinary Call can add an
// ambient donor. Other references retain exactly their original classification.
func sourceCallArgumentReferenceEffects(fact *callableFacts, node *ast.Node, source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner, invocation *sourceRelativeInvocation, ordinal int) ([]EnvironmentEffectSource, []ContextEffect, sourceAmbientArgumentRead) {
	old := func() ([]EnvironmentEffectSource, []ContextEffect, sourceAmbientArgumentRead) {
		effects, contexts := sourceReferenceEffects(node, fact.node, source, c, fact.summary.Name)
		return effects, contexts, sourceAmbientArgumentRead{}
	}
	if node == nil || !ast.IsIdentifier(node) || source == nil || source.IsDeclarationFile || !ast.IsExternalModule(source) || owner == nil || owner.values == nil || owner.project == nil || owner.project.config == nil || owner.checker != c || owner.values.checker != c || !installedMemberGenerationActive(owner.values.generation) || owner.values.program != owner.values.generation.program || owner.values.generation.checker != c || owner.project.activeGeneration != owner.values.generation {
		return old()
	}
	call := node.Parent
	if call == nil || !ast.IsCallExpression(call) || call.Expression() == node || !ast.IsIdentifier(call.Expression()) || call.AsCallExpression().QuestionDotToken != nil || sourceParameterDefault(node, fact.node) != nil {
		return old()
	}
	if invocation == nil {
		for i := range fact.staged.calls {
			candidate := &fact.staged.calls[i]
			if candidate.invocation.operation == call && candidate.kind == relativeDemandEffects && !candidate.legacyInputs && validStagedDataResultCall(*candidate) {
				invocation = &candidate.invocation
				break
			}
		}
		if invocation == nil {
			return old()
		}
		ordinal = -1
		for i, actual := range invocation.actuals {
			if actual.expression == node {
				ordinal = i
				break
			}
		}
	}
	if invocation.operation != call || invocation.use != call || invocation.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || !invocation.actualsKnown || ordinal < 0 || ordinal >= len(invocation.actuals) || invocation.actuals[ordinal].ordinal != ordinal || invocation.actuals[ordinal].expression != node || invocation.actuals[ordinal].endpoint.cut != (sourceRelativeCut{operation: call, use: call, reading: node}) || invocation.declaration == nil || !ast.IsFunctionDeclaration(invocation.declaration) || invocation.declaration.Body() == nil || ast.GetSourceFileOfNode(invocation.declaration) != source || !sourceStagedOccurrenceOwned(call, fact.node) {
		return old()
	}
	publisher := owner.pendingMemberPublishers[fact.node]
	if publisher == nil || !publisher.live || publisher.fact != fact || fact.sourceFile != source || owner.values.program.GetSourceFile(source.FileName()) != source {
		return old()
	}
	index := owner.values.index(source)
	if index.incomplete || index.normalDynamicScope {
		return old()
	}
	g := owner.values.generation
	cache := owner.ambientArgumentReferences
	if cache != nil && (cache.generation != g || cache.program != g.program || cache.checker != c || cache.config != owner.project.config) {
		owner.ambientArgumentReferences, cache = nil, nil
	}
	var r *sourceAmbientArgumentReference
	if cache != nil {
		r = cache.entries[node]
	}
	if r != nil && !ambientArgumentReferenceCurrent(r, owner, source) {
		delete(cache.entries, node)
		r = nil
	}
	if r == nil {
		symbol := c.GetSymbolAtLocation(node)
		effects, contexts := sourceBoundReferenceEffects(node, fact.node, source, c, "", symbol)
		if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || len(symbol.Declarations) != 1 || symbol.Declarations[0] != symbol.ValueDeclaration || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || symbol.ValueDeclaration.Initializer() != nil || ast.GetSourceFileOfNode(symbol.ValueDeclaration) != source || ast.GetCombinedModifierFlags(symbol.ValueDeclaration)&ast.ModifierFlagsAmbient == 0 || owner.values.bindingWritten(symbol) {
			// The old classifier's diagnostic owner path is rebuilt without another
			// lookup. Missing compiler-owned/selected-module work stays unsupported.
			return ambientReferenceEffectsForOwner(effects, fact.summary.Name), contexts, sourceAmbientArgumentRead{}
		}
		effect := environmentSource("unknown", "external ambient argument read "+node.Text(), "")
		effect.Opaque = true
		effects = append(effects, effect)
		r = &sourceAmbientArgumentReference{node: node, declaration: symbol.ValueDeclaration, symbol: symbol, source: source, program: g.program, checker: c, config: owner.project.config, generation: g, effects: effects, contexts: append([]ContextEffect(nil), contexts...)}
		if cache == nil {
			cache = &sourceAmbientArgumentReferences{generation: g, program: g.program, checker: c, config: owner.project.config, entries: make(map[*ast.Node]*sourceAmbientArgumentReference)}
			owner.ambientArgumentReferences = cache
		}
		cache.entries[node] = r
	}
	use := sourceAmbientArgumentRead{reference: r, call: call, argument: node, owner: fact.node, ordinal: ordinal, cut: invocation.actuals[ordinal].endpoint.cut, ownerName: fact.summary.Name}
	return ambientReferenceEffectsForOwner(r.effects, use.ownerName), append([]ContextEffect(nil), r.contexts...), use
}

// Cache donors are immutable; each publisher receives its own paths and slice.
func ambientReferenceEffectsForOwner(effects []EnvironmentEffectSource, name string) []EnvironmentEffectSource {
	result := append([]EnvironmentEffectSource(nil), effects...)
	for i := range result {
		result[i].Path = append([]string(nil), result[i].Path...)
		if len(result[i].Path) != 0 {
			result[i].Path[0] = name
		}
	}
	return result
}

// validAmbientArgumentReads restricts every environment atom to the exact
// ordered source argument associations issued by this Call owner.
func validAmbientArgumentReads(recipe sourceStagedOperationRecipe) bool {
	source := recipe.declarationCall
	if source == nil {
		return false
	}
	priorOrdinal := -1
	for _, read := range source.ambientReads {
		r := read.reference
		if r == nil || r.generation != recipe.declarationCallGeneration || r.generation == nil || r.program != r.generation.program || r.checker != r.generation.checker || r.generation.project == nil || r.config == nil || r.config != r.generation.project.config || r.node != read.argument || r.symbol == nil || r.symbol.Flags&ast.SymbolFlagsAlias != 0 || r.symbol.ValueDeclaration != r.declaration || len(r.symbol.Declarations) != 1 || r.symbol.Declarations[0] != r.declaration || !ast.IsVariableDeclaration(r.declaration) || r.declaration.Initializer() != nil || ast.GetCombinedModifierFlags(r.declaration)&ast.ModifierFlagsAmbient == 0 || ast.GetSourceFileOfNode(r.declaration) != r.source || ast.GetSourceFileOfNode(read.argument) != r.source || read.call != recipe.key.operation || read.owner != recipe.key.declaration || read.argument.Parent != read.call || !ast.IsIdentifier(read.argument) || read.ordinal <= priorOrdinal || read.ordinal >= len(source.invocation.actuals) || source.invocation.actuals[read.ordinal].expression != read.argument || source.invocation.actuals[read.ordinal].ordinal != read.ordinal || read.cut != source.invocation.actuals[read.ordinal].endpoint.cut || read.cut != (sourceRelativeCut{operation: read.call, use: read.call, reading: read.argument}) || len(r.effects) == 0 {
			return false
		}
		priorOrdinal = read.ordinal
		unknown := false
		for _, effect := range r.effects {
			if !validOperationEnvironmentEffect(effect) || len(effect.Path) == 0 {
				return false
			}
			unknown = unknown || effect.Environment == "unknown" && effect.Opaque
			found := false
			for _, published := range recipe.delta.effects {
				if ambientArgumentEffectMatches(read, effect, published) {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		if !unknown {
			return false
		}
	}
	// This owner permits only these exact typed argument donors, never arbitrary
	// environment atoms or a missing expected donor represented by an empty X.
	for i, effect := range recipe.delta.effects {
		matched := false
		for _, read := range source.ambientReads {
			for _, original := range read.reference.effects {
				matched = matched || ambientArgumentEffectMatches(read, original, effect)
			}
		}
		if !matched {
			return false
		}
		for _, prior := range recipe.delta.effects[:i] {
			if sameOperationEffect(prior, effect) {
				return false
			}
		}
	}
	return true
}

// Donor ownership paths are rebuilt for each use; all other classification
// fields must match the immutable original reference contribution.
func ambientArgumentEffectMatches(read sourceAmbientArgumentRead, original, effect EnvironmentEffectSource) bool {
	if len(original.Path) == 0 || len(effect.Path) != len(original.Path) || effect.Path[0] != read.ownerName || !slices.Equal(effect.Path[1:], original.Path[1:]) {
		return false
	}
	original.Path = effect.Path
	return sameOperationEffect(original, effect)
}

func sameAmbientArgumentReads(a, b []sourceAmbientArgumentRead) bool {
	if len(a) != len(b) {
		return false
	}
	for i, r := range a {
		if r != b[i] {
			return false
		}
	}
	return true
}

// Original source renewal and canonical Call/BODY/subscriber gates are still
// mandatory. An expired source classification cannot close a new/current graph.
func ambientArgumentReadsCurrent(reads []sourceAmbientArgumentRead, generation *projectGeneration) bool {
	for _, read := range reads {
		r := read.reference
		if r == nil || r.generation != generation || !installedMemberGenerationActive(generation) || r.program != generation.program || r.checker != generation.checker || generation.project == nil || r.config != generation.project.config {
			return false
		}
	}
	return true
}
