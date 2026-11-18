package exactcompiler

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// helperMutationPlan retains source identities only for this exact-paired compilation.
// Entries share their ordinary callable's module. No library or runtime registry is published.
type helperMutationPlan struct {
	entries         map[string]helperMutationEntry
	calls           map[string]string
	sources         []HelperSource
	selectedSources bool
}

type helperMutationEntry struct {
	node          *ast.Node
	source        *ast.SourceFile
	name          string
	writes        []StateWrite
	nativeTargets map[SourceSpan]*ast.Node
}

// HelperPublication describes component-required companion work, not executable
// authority. Every consumer resolves the original edge again in its current
// Program/checker; coordinates and hashes alone never authorize a helper body.
// Revisions/spans describe the authored prepared input via its guarded normalization,
// including virtual suffix identity, not a particular checked prop-casing stage.
type HelperPublication struct {
	Owner          string     `json:"owner"`
	OwnerRevision  string     `json:"ownerRevision"`
	Component      SourceSpan `json:"component"`
	Call           SourceSpan `json:"call"`
	SourceFile     string     `json:"sourceFile"`
	SourceRevision string     `json:"sourceRevision"`
	Declaration    SourceSpan `json:"declaration"`
	Config         string     `json:"config"`
	Selected       bool       `json:"selected"`
	Purpose        Target     `json:"purpose"`
}

func helperPublicationConfig(project *projectState) string {
	options, err := json.Marshal(project.config.CompilerOptions())
	if err != nil {
		return ""
	}
	return preparedContentRevision(project.configFile + "\x00" + string(options))
}

// helperPublicationInput uses the original prepared input including virtual
// package suffixes. Checked prop casing may change text/length, never this identity.
func helperPublicationInput(source normalizedSource) (string, bool) {
	end := len(source.authoredOffsets) - 1
	if end < 0 || end > len(source.text) {
		return "", false
	}
	return source.authored + source.text[end:], true
}

func helperPublicationRevision(source normalizedSource) (string, bool) {
	input, known := helperPublicationInput(source)
	if !known {
		return "", false
	}
	return preparedContentRevision(input), true
}

// publicationSpan refuses inserted/unmapped ranges rather than allowing the
// diagnostic mapper's clamping to fabricate an original component/call/declaration.
func (source normalizedSource) publicationSpan(node *ast.Node) (SourceSpan, bool) {
	if node == nil || node.Pos() < 0 || node.End() <= node.Pos() || node.End() >= len(source.authoredOffsets) {
		return SourceSpan{}, false
	}
	start, length := source.authoredSpan(node.Pos(), node.End()-node.Pos())
	if length <= 0 || start < 0 || start+length > len(source.authored) {
		return SourceSpan{}, false
	}
	return SourceSpan{Start: start, Length: length}, true
}

// describeHelperPublication reuses guarded authored provenance for EVERY span.
// MostOriginal cannot carry identity across a reparse or replacement Program.
func describeHelperPublication(source *ast.SourceFile, call *ast.Node, entry helperMutationEntry, owner *executableBodyOwner, config string) (HelperPublication, bool) {
	if owner == nil || owner.project == nil || owner.values == nil {
		return HelperPublication{}, false
	}
	for parent := call.Parent; parent != nil; parent = parent.Parent {
		if _, component := owner.values.components[parent]; !component || ast.GetSourceFileOfNode(parent) != source {
			continue
		}
		origin, known := owner.project.currentSourceNormalization(source)
		target, selected := owner.project.currentSourceNormalization(entry.source)
		if !known || !selected {
			return HelperPublication{}, false
		}
		componentSpan, componentOK := origin.publicationSpan(parent)
		callSpan, callOK := origin.publicationSpan(call)
		declaration, declOK := target.publicationSpan(entry.node)
		ownerRevision, ownerOK := helperPublicationRevision(origin)
		sourceRevision, sourceOK := helperPublicationRevision(target)
		if !componentOK || !callOK || !declOK || !ownerOK || !sourceOK {
			return HelperPublication{}, false
		}
		if config == "" {
			config = helperPublicationConfig(owner.project)
		}
		if config == "" {
			return HelperPublication{}, false
		}
		return HelperPublication{Owner: source.FileName(), OwnerRevision: ownerRevision, Component: componentSpan, Call: callSpan, SourceFile: entry.source.FileName(), SourceRevision: sourceRevision, Declaration: declaration, Config: config, Selected: owner.selection != nil, Purpose: TargetServer}, true
	}
	return HelperPublication{}, false
}

// helperPublicationDemand maps the SAME authored coordinates through this
// Program's genuine projection. Context-only owners never become Effects roots.
func helperPublicationDemand(collection *projectCallableCollection, requested *ast.SourceFile, add func(int)) {
	owner := collection.owner
	if len(owner.project.helperPublications) == 0 {
		return
	}
	target, known := owner.project.currentSourceNormalization(requested)
	if !known {
		return
	}
	revision, known := helperPublicationRevision(target)
	if !known {
		return
	}
	config := helperPublicationConfig(owner.project)
	if config == "" {
		return
	}
	for _, description := range owner.project.helperPublications {
		if description.SourceFile != requested.FileName() || description.SourceRevision != revision || description.Config != config || description.Purpose != TargetServer || description.Selected != (owner.selection != nil) {
			continue
		}
		source := owner.project.program.GetSourceFile(description.Owner)
		origin, known := owner.project.currentSourceNormalization(source)
		if !known {
			continue
		}
		original, known := helperPublicationRevision(origin)
		if !known || original != description.OwnerRevision {
			continue
		}
		var component, call *ast.Node
		ambiguous := false
		for node := range owner.values.components {
			if ast.GetSourceFileOfNode(node) != source {
				continue
			}
			span, mapped := origin.publicationSpan(node)
			if mapped && span == description.Component {
				if component != nil {
					ambiguous = true
					break
				}
				component = node
			}
		}
		if component == nil || ambiguous {
			continue
		}
		walkNode(component, func(node *ast.Node) bool {
			if ambiguous {
				return false
			}
			if !ast.IsCallExpression(node) {
				return true
			}
			span, mapped := origin.publicationSpan(node)
			if mapped && span == description.Call {
				if call != nil {
					ambiguous = true
				}
				call = node
			}
			return true
		})
		if call == nil || ambiguous {
			continue
		}
		expression := helperMutationCallCandidate(call)
		if expression == nil || call.AsCallExpression().QuestionDotToken != nil {
			continue
		}
		body, selected := owner.body(expression)
		index, known := collection.nodes[body]
		if !selected {
			if symbol := selectedHelperSymbol(expression, owner.checker); symbol != nil {
				index, known = collection.symbols[ast.GetSymbolId(symbol)]
			}
		}
		if !known {
			continue
		}
		fact := collection.facts[index]
		declaration, mapped := target.publicationSpan(fact.node)
		if fact.sourceFile == requested && mapped && declaration == description.Declaration {
			add(index)
		}
	}
}

// HelperSource is an ephemeral resolved executable edge, not package helper metadata.
type HelperSource struct {
	ModuleSpecifier string              `json:"moduleSpecifier"`
	SourceFile      string              `json:"sourceFile"`
	Publication     []HelperPublication `json:"publication,omitempty"`
}

// directScalarHelper accepts module-owned immutable bodies whose parameter writes can
// use the shared selected-reference planner. Nested execution owners remain separate.
func directScalarHelper(fact *callableFacts, c *checker.Checker) bool {
	node := fact.node
	if fact.summary.Kind != "function" || node.Body() == nil || fact.sourceFile.IsDeclarationFile || !ast.IsExternalModule(fact.sourceFile) {
		return false
	}
	if ast.IsFunctionDeclaration(node) {
		if node.Parent != fact.sourceFile.AsNode() || node.Name() == nil || node.AsFunctionDeclaration().AsteriskToken != nil {
			return false
		}
	} else if ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) {
		binding := sourceCallableBinding(node)
		if binding == nil || binding.Parent == nil || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Parent.Parent == nil || binding.Parent.Parent.Parent != fact.sourceFile.AsNode() {
			return false
		}
		// Named expressions own a self binding distinct from the ordinary module value.
		if ast.IsFunctionExpression(node) && (node.Name() != nil || node.AsFunctionExpression().AsteriskToken != nil) {
			return false
		}
	} else {
		return false
	}
	if helperReflectRoot(fact.sourceFile) == "" {
		return false
	}
	symbol := callableDeclarationSymbol(node, c)
	if symbol == nil || componentValueSymbolIsWrittenAfter(symbol, 0, fact.sourceFile, c) {
		return false
	}
	valid := true
	walkNode(node, func(current *ast.Node) bool {
		if ast.IsPartOfTypeNode(current) {
			return false
		}
		if current != node && (isCallableNode(current) || ast.IsClassDeclaration(current) || ast.IsClassExpression(current)) {
			valid = false
			return false
		}
		if ast.IsArrowFunction(node) {
			propertyName := current.Parent != nil && ast.IsPropertyAssignment(current.Parent) && current.Parent.Name() == current
			argumentsReference := ast.IsIdentifier(current) && current.Text() == "arguments" && !isStaticPropertyName(current) && !propertyName
			newTarget := current.Kind == ast.KindMetaProperty && current.AsMetaProperty().KeywordToken == ast.KindNewKeyword
			if current.Kind == ast.KindThisKeyword || newTarget || argumentsReference {
				valid = false
			}
		}
		if _, operation := stateWriteTarget(current, c); operation != "" && operation != "assignment" && operation != "update" && operation != "delete" && !selectedNativeArrayPush(current, c) {
			valid = false
		}
		return valid
	})
	return valid
}

// selectedHelperSymbol deliberately does not unwrap call/apply or arbitrary members.
// Effect resolution can describe those calls without proving the selected function.
func selectedHelperSymbol(expression *ast.Node, c *checker.Checker) *ast.Symbol {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil || !ast.IsIdentifier(expression) {
		return nil
	}
	return sourceCallableSymbol(c.GetSymbolAtLocation(expression), c)
}

// helperMutationCallCandidate is the necessary syntactic form shared by discovery
// and the final planner. It grants no immutable binding or callable authority.
// Optional calls remain candidates here, while the existing planner refuses them.
func helperMutationCallCandidate(node *ast.Node) *ast.Node {
	if !ast.IsCallExpression(node) {
		return nil
	}
	if node.AsCallExpression().QuestionDotToken != nil {
		return node.AsCallExpression().Expression
	}
	expression := unwrapSourceCallableReference(node.AsCallExpression().Expression)
	if expression == nil || !ast.IsIdentifier(expression) {
		return nil
	}
	return expression
}

func planHelperMutations(source *ast.SourceFile, analysis callableAnalysis, c *checker.Checker) helperMutationPlan {
	plan := helperMutationPlan{entries: map[string]helperMutationEntry{}, calls: map[string]string{}, sources: []HelperSource{}}
	plan.selectedSources = analysis.owner != nil && analysis.owner.selection != nil
	for _, fact := range analysis.facts {
		if fact.summary.ownedScalarBlocked || len(fact.summary.StateWrites) == 0 {
			continue
		}
		finite := true
		for _, effect := range fact.summary.StateWrites {
			if effect.Receiver == nil || effect.Receiver.Kind != "parameter" || effect.Confidence != "exact" || effect.Operation != "" {
				finite = false
			}
		}
		if !finite {
			continue
		}
		// Private companion naming uses the same genuine original declaration on
		// both sides of a checked reparse. Canonical callable/Call IDs remain intact.
		if analysis.owner == nil || analysis.owner.project == nil {
			continue
		}
		origin, known := analysis.owner.project.currentSourceNormalization(fact.sourceFile)
		if !known {
			continue
		}
		declaration, mapped := origin.publicationSpan(fact.node)
		authored, current := helperPublicationInput(origin)
		if !mapped || !current {
			continue
		}
		identity := fmt.Sprintf("callable:%s:%d", fact.sourceFile.FileName(), declaration.Start)
		digest := sha256.Sum256([]byte(identity))
		name := fmt.Sprintf("__exact_owned_%x", digest[:8])
		// Reserve against authored names rather than assuming the private prefix is unavailable.
		for strings.Contains(authored, name) {
			name += "_"
		}
		writes := []StateWrite{}
		nativeTargets := map[SourceSpan]*ast.Node{}
		parameters := parameterStateSymbols(fact.node, c)
		walkCallable(fact.node, func(node *ast.Node) bool {
			if nativeAssignmentTargetRole(node) == nativeAssignmentPattern {
				if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
					if _, owned := parameterStateEffect(node, "write", parameters, c); owned {
						nativeTargets[nodeSourceSpan(node)] = node
					}
				}
				return true
			}
			if target, operation := stateWriteTarget(node, c); operation == "assignment" || operation == "update" || operation == "delete" || selectedNativeArrayPush(node, c) {
				// Assignment to a parameter binding stays local. Calls such as array push
				// still mutate the selected parameter value and retain their existing plan.
				if (operation == "assignment" || operation == "update") && ast.IsIdentifier(unwrapSourceCallableReference(target)) {
					return true
				}
				if _, owned := parameterStateEffect(target, "write", parameters, c); owned {
					writes = append(writes, StateWrite{Operation: operation, Start: node.Pos(), Length: node.End() - node.Pos()})
				}
			}
			return true
		})
		plan.entries[fact.summary.ID] = helperMutationEntry{node: fact.node, source: fact.sourceFile, name: name, writes: writes, nativeTargets: nativeTargets}
	}
	seen := map[string]int{}
	publicationConfig := ""
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		expression := helperMutationCallCandidate(node)
		if expression == nil || node.AsCallExpression().QuestionDotToken != nil {
			return true
		}
		// Execution ownership and the existing immutable-binding proof still
		// choose the body. A syntax candidate alone supplies neither.
		var summary CallableSummary
		var ok bool
		if body, owned := analysis.owner.body(expression); owned {
			summary, ok = analysis.byNode[body]
		} else {
			// Unselected SDK compilations retain their existing immutable-alias proof.
			symbol := selectedHelperSymbol(expression, c)
			if symbol == nil {
				return true
			}
			summary, ok = analysis.bySymbol[ast.GetSymbolId(symbol)]
		}
		entry, eligible := plan.entries[summary.ID]
		if !ok || !eligible {
			return true
		}
		plan.calls[nodeSpanKey(node)] = summary.ID
		if entry.source != source {
			index, exists := seen[entry.source.FileName()]
			if !exists {
				index = len(plan.sources)
				seen[entry.source.FileName()] = index
				specifier := helperSourceSpecifier(source, entry.source, plan.selectedSources)
				plan.sources = append(plan.sources, HelperSource{ModuleSpecifier: specifier, SourceFile: entry.source.FileName()})
			}
			if description, component := describeHelperPublication(source, node, entry, analysis.owner, publicationConfig); component {
				publicationConfig = description.Config
				plan.sources[index].Publication = append(plan.sources[index].Publication, description)
			}
		}
		return true
	})
	// Replace only this original owner's descriptions. A later helper request
	// cannot lend effects back to its caller or retain an obsolete owner revision.
	if analysis.owner != nil && analysis.owner.project != nil {
		project := analysis.owner.project
		kept := project.helperPublications[:0]
		for _, description := range project.helperPublications {
			if description.Owner != source.FileName() {
				kept = append(kept, description)
			}
		}
		for _, edge := range plan.sources {
			kept = append(kept, edge.Publication...)
		}
		project.helperPublications = kept
	}
	return plan
}

func helperSourceSpecifier(from, to *ast.SourceFile, selected bool) string {
	relative, _ := filepath.Rel(filepath.Dir(from.FileName()), to.FileName())
	relative = filepath.ToSlash(relative)
	if !strings.HasPrefix(relative, ".") {
		relative = "./" + relative
	}
	// Host-selected imports must name the exact acquired executable source. The
	// unselected portable SDK path retains its existing emitted JS suffix contract.
	if selected {
		return relative
	}
	// The resolved source remains authoritative even when the emitted specifier uses JS.
	extension := filepath.Ext(relative)
	runtimeExtension := ".js"
	switch strings.ToLower(extension) {
	case ".mts", ".mjs":
		runtimeExtension = ".mjs"
	case ".cts", ".cjs":
		runtimeExtension = ".cjs"
	}
	return strings.TrimSuffix(relative, extension) + runtimeExtension
}

// helperReflectRoot selects an unshadowed intrinsic reference for the private wrapper.
// Authored references inside the cloned body retain their own module bindings.
func helperReflectRoot(source *ast.SourceFile) string {
	shadowed := func(name string) bool {
		symbol := source.AsNode().Locals()[name]
		return symbol != nil && symbol.Flags&(ast.SymbolFlagsValue|ast.SymbolFlagsAlias) != 0
	}
	if !shadowed("Reflect") {
		return "Reflect"
	}
	if !shadowed("globalThis") {
		return "globalThis"
	}
	return ""
}

// selectedNativeArrayPush admits only the existing typed push operation, never an immutable callee assumption.
func selectedNativeArrayPush(node *ast.Node, c *checker.Checker) bool {
	if !ast.IsCallExpression(node) || node.Flags&ast.NodeFlagsOptionalChain != 0 {
		return false
	}
	_, method := restrictedInvocationMember(unwrapSourceCallableReference(node.AsCallExpression().Expression), c)
	if method != "push" {
		return false
	}
	_, operation := stateWriteTarget(node, c)
	return operation == "array-mutation"
}
