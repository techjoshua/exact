package exactcompiler

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// ExecutableSelection is an internal, source-backed executable snapshot. Hosts own
// resolution and increase Generation for every replacement, including target/config changes.
// Selected sessions require replacement snapshots until reset. Helper rewriting additionally requires the same immutable executable body owner.
type ExecutableSelection struct {
	Generation uint64             `json:"generation"`
	Revision   string             `json:"revision"`
	Target     Target             `json:"target"`
	Modules    []ExecutableModule `json:"modules"`
	Edges      []ExecutableEdge   `json:"edges"`
}

// ExecutableModule pairs a physical prepared source with its host module identity.
// ContentRevision is the SHA-256 of the supplied prepared source, before normalization.
// Distinct host instances of one physical source require separate prepared source IDs.
type ExecutableModule struct {
	ID              string `json:"id"`
	SourceID        string `json:"sourceId"`
	ContentRevision string `json:"contentRevision"`
}

// ExecutableEdge selects one original syntax slot. Slot is the zero-based source-order
// index among import/export module specifiers and literal require/import calls.
// An empty Selected denotes an opaque or external edge, never a typed-body fallback.
type ExecutableEdge struct {
	Importer  string `json:"importer"`
	Slot      int    `json:"slot"`
	Specifier string `json:"specifier"`
	Kind      string `json:"kind"`
	Selected  string `json:"selected,omitempty"`
}

type executableSlot struct {
	node      *ast.Node
	specifier string
	kind      string
}

type executableEdgeKey struct {
	source string
	slot   int
}

// executableSelection contains no checker identities. Program-local queries recover
// original binding provenance before alias flattening. Whole-generation invalidation
// keeps the existing fact cache authoritative without a second effect graph.
type executableSelection struct {
	snapshot ExecutableSelection
	modules  map[string]string
	edges    map[executableEdgeKey]ExecutableEdge
	contents map[string]string
}

func executableSlots(source *ast.SourceFile) []executableSlot {
	var slots []executableSlot
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		specifier, kind := executableDeclarationReference(node)
		switch {
		case ast.IsCallExpression(node):
			call := node.AsCallExpression()
			if moduleCallExpression(call.Expression) && call.Arguments != nil && len(call.Arguments.Nodes) == 1 {
				specifier = call.Arguments.Nodes[0]
				if ast.IsIdentifier(call.Expression) {
					kind = "require"
				}
			}
		}
		if specifier != nil && ast.IsStringLiteralLike(specifier) {
			slots = append(slots, executableSlot{node, specifier.Text(), kind})
		}
		return true
	})
	return slots
}

// prepareExecutableSelection validates the complete replacement before publication.
// Missing modules, duplicate physical identities and stale generations cannot grant authority.
func prepareExecutableSelection(request Request, sources []synchronizedProjectSource, state *projectState) (*executableSelection, error) {
	input := request.ExecutableSelection
	if input == nil {
		if state.executableSelection != nil {
			return nil, fmt.Errorf("selected analysis requires a replacement executable selection or session reset")
		}
		return nil, nil
	}
	if input.Generation == 0 || input.Revision == "" || (input.Target != TargetDefault && input.Target != TargetClient && input.Target != TargetServer) {
		return nil, fmt.Errorf("executable selection requires a generation, revision and target")
	}
	if input.Generation <= state.selectionGeneration {
		previous := state.executableSelection
		if previous == nil || !reflect.DeepEqual(*input, previous.snapshot) {
			return nil, fmt.Errorf("stale executable selection generation")
		}
	}

	prepared := make(map[string]synchronizedProjectSource, len(sources))
	for _, source := range sources {
		prepared[state.fs.canonical(source.fileName)] = source
	}
	result := &executableSelection{snapshot: *input, modules: make(map[string]string), edges: make(map[executableEdgeKey]ExecutableEdge), contents: make(map[string]string)}
	result.snapshot.Modules = append([]ExecutableModule(nil), input.Modules...)
	result.snapshot.Edges = append([]ExecutableEdge(nil), input.Edges...)
	physical := make(map[string]bool)
	for _, module := range input.Modules {
		filename, err := normalizeFileName(module.SourceID, request.Root)
		if err != nil {
			return nil, err
		}
		path := state.fs.canonical(filename)
		source, exists := prepared[path]
		if !exists || module.ID == "" || result.modules[module.ID] != "" || physical[path] || module.ContentRevision != source.contentRevision {
			return nil, fmt.Errorf("executable module %q requires a unique prepared source with matching content revision", module.ID)
		}
		physical[path] = true
		result.modules[module.ID] = filename
		result.contents[path] = source.source
	}
	for _, edge := range input.Edges {
		importer, exists := result.modules[edge.Importer]
		key := executableEdgeKey{state.fs.canonical(importer), edge.Slot}
		_, duplicate := result.edges[key]
		if !exists || edge.Slot < 0 || edge.Specifier == "" || (edge.Kind != "import" && edge.Kind != "require") || duplicate || (edge.Selected != "" && result.modules[edge.Selected] == "") {
			return nil, fmt.Errorf("invalid executable import slot in %q", edge.Importer)
		}
		result.edges[key] = edge
	}
	return result, nil
}

// executableBodyOwner is acquired with one checker and never survives its Program.
// The boolean result distinguishes an explicitly owned opaque edge from no host proof.
type executableBodyOwner struct {
	selection    *executableSelection
	project      *projectState
	checker      *checker.Checker
	slots        map[*ast.Node]ExecutableEdge
	resolving    map[string]bool
	stableBodies map[*ast.Node]bool
	values       *sourceValueOwner
}

func newExecutableBodyOwner(project *projectState, c *checker.Checker) *executableBodyOwner {

	owner := &executableBodyOwner{selection: project.executableSelection, project: project, checker: c, slots: make(map[*ast.Node]ExecutableEdge), resolving: make(map[string]bool), stableBodies: make(map[*ast.Node]bool)}
	owner.values = newSourceValueOwner(c)
	owner.values.program = project.program
	owner.values.generation = project.activeGeneration
	owner.values.language = project.activeGeneration.acquireLanguageOwner()
	if owner.selection == nil {
		return owner
	}
	for _, filename := range owner.selection.modules {
		source := project.program.GetSourceFile(filename)
		if source == nil {
			continue
		}
		path := project.fs.canonical(source.FileName())
		for index, slot := range executableSlots(source) {
			if edge, exists := owner.selection.edges[executableEdgeKey{path, index}]; exists && slot.specifier == edge.Specifier && slot.kind == edge.Kind {
				owner.slots[slot.node] = edge
			}
		}
	}
	return owner
}

func (owner *executableBodyOwner) selectedModule(slot *ast.Node) (*ast.SourceFile, bool) {
	if owner == nil || owner.selection == nil {
		return nil, false
	}
	source := ast.GetSourceFileOfNode(slot)
	if source == nil {
		return nil, false
	}
	// An explicit snapshot owns all slots in its module closure. Unprovided slots
	// are opaque. Legacy checker/stem inference remains only outside that closure.
	path := owner.project.fs.canonical(source.FileName())
	content, owned := owner.selection.contents[path]
	if !owned {
		return nil, false
	}
	if content != source.Text() {
		return nil, true
	}
	edge, exists := owner.slots[slot]
	if !exists || edge.Selected == "" {
		return nil, true
	}
	filename := owner.selection.modules[edge.Selected]
	selected := owner.project.program.GetSourceFile(filename)
	if selected == nil || selected.IsDeclarationFile || owner.selection.contents[owner.project.fs.canonical(filename)] != selected.Text() {
		return nil, true
	}
	return selected, true
}

func (owner *executableBodyOwner) expressionSymbol(expression *ast.Node, seen map[ast.SymbolId]bool) (*ast.Symbol, bool) {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return nil, false
	}
	// Namespace members retain the namespace import slot, rather than its flattened export.
	if ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
		receiver := stableSourceCallableReference(expression.Expression(), owner.checker)
		var symbol *ast.Symbol
		if receiver != nil && ast.IsIdentifier(receiver) {
			symbol = owner.checker.GetSymbolAtLocation(receiver)
		}
		if symbol != nil {
			for _, declaration := range symbol.Declarations {
				if ast.IsNamespaceImport(declaration) {
					for slot := declaration.Parent; slot != nil; slot = slot.Parent {
						if ast.IsImportDeclaration(slot) {
							selected, owned := owner.selectedModule(slot)
							if !owned {
								break
							}
							name := ""
							if ast.IsPropertyAccessExpression(expression) {
								name = expression.Name().Text()
							} else if argument := expression.AsElementAccessExpression().ArgumentExpression; argument != nil && ast.IsStringLiteralLike(argument) {
								name = argument.Text()
							}
							if owner.declaredExternalContract(slot, namespaceCallableSymbol(receiver, name, owner.checker)) {
								return nil, false
							}
							return owner.exportSymbol(selected, name, seen), true
						}
					}
				}
			}
		}
		// Arbitrary members keep existing possible-effect analysis. A namespace
		// export selection above is distinct from private invocation rewrite proof.
		return nil, false
	}
	return owner.symbol(sourceCallableReferenceSymbol(expression, owner.checker), seen)
}

func (owner *executableBodyOwner) symbol(symbol *ast.Symbol, seen map[ast.SymbolId]bool) (*ast.Symbol, bool) {
	if owner == nil || owner.selection == nil || symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return nil, false
	}
	seen[ast.GetSymbolId(symbol)] = true
	for _, declaration := range symbol.Declarations {
		switch {
		case ast.IsShorthandPropertyAssignment(declaration):
			return owner.symbol(owner.checker.GetShorthandAssignmentValueSymbol(declaration), seen)
		case ast.IsImportSpecifier(declaration), ast.IsImportClause(declaration), ast.IsExportSpecifier(declaration), ast.IsImportEqualsDeclaration(declaration):
			for slot := declaration; slot != nil; slot = slot.Parent {
				if ast.IsImportDeclaration(slot) || ast.IsExportDeclaration(slot) || ast.IsImportEqualsDeclaration(slot) {
					selected, owned := owner.selectedModule(slot)
					if !owned {
						break
					}
					name := "default"
					if ast.IsImportSpecifier(declaration) {
						name = declaration.Name().Text()
						if p := declaration.AsImportSpecifier().PropertyName; p != nil {
							name = p.Text()
						}
					}
					if ast.IsExportSpecifier(declaration) {
						name = declaration.Name().Text()
						if p := declaration.AsExportSpecifier().PropertyName; p != nil {
							name = p.Text()
						}
					}
					if owner.declaredExternalContract(slot, symbol) {
						return nil, false
					}
					return owner.exportSymbol(selected, name, seen), true
				}
			}
		case ast.IsVariableDeclaration(declaration):
			initializer := unwrapSourceCallableReference(declaration.Initializer())
			if initializer != nil && (ast.IsIdentifier(initializer) || ast.IsPropertyAccessExpression(initializer) || ast.IsElementAccessExpression(initializer)) {
				// Effect selection follows existing finite aliases. This is not immutable-call rewrite proof.
				selected, owned := owner.expressionSymbol(initializer, seen)
				// An ordinary property value is still this module's exported binding.
				// Failure to prove a callable alias must not erase its definition and
				// captured initialization requirements from downstream partitioning.
				if selected == nil && !owned {
					return symbol, false
				}
				source := ast.GetSourceFileOfNode(declaration)
				if owned && (declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 || componentValueSymbolIsWrittenAfter(symbol, declaration.End(), source, owner.checker)) {
					return nil, true
				}
				return selected, owned
			}
		}
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return owner.symbol(owner.checker.GetAliasedSymbol(symbol), seen)
	}
	return symbol, false
}

// declaredExternalContract keeps an existing published declaration contract separate
// from executable body ownership. Only an unchanged external slot and actual bodyless
// package declarations can use this path. Selected bodies and opaque local slots retain
// snapshot authority, and no declaration becomes a private helper implementation.
func (owner *executableBodyOwner) declaredExternalContract(slot *ast.Node, symbol *ast.Symbol) bool {
	edge, exists := owner.slots[slot]
	if !exists || edge.Selected != "" || strings.HasPrefix(edge.Specifier, ".") || filepath.IsAbs(edge.Specifier) {
		return false
	}
	source := ast.GetSourceFileOfNode(slot)
	if source == nil || owner.selection.contents[owner.project.fs.canonical(source.FileName())] != source.Text() {
		return false
	}
	symbol = resolvedCallableSymbol(symbol, owner.checker)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	runtimeDeclaration := false
	for _, declaration := range symbol.Declarations {
		// A merged type/value export keeps its type-only declarations, but only
		// the actual ambient value can supply an operation contract.
		if ast.IsTypeAliasDeclaration(declaration) || ast.IsInterfaceDeclaration(declaration) {
			continue
		}
		origin := ast.GetSourceFileOfNode(declaration)
		if origin == nil || !origin.IsDeclarationFile || !(ast.IsFunctionDeclaration(declaration) && declaration.Body() == nil || ast.IsVariableDeclaration(declaration) && declaration.Initializer() == nil) {
			return false
		}
		runtimeDeclaration = true
		if _, classified := declarationSourceEnvironment(origin, symbol.Name); !classified {
			return false
		}
	}
	return runtimeDeclaration
}

func (owner *executableBodyOwner) exportSymbol(source *ast.SourceFile, name string, seen map[ast.SymbolId]bool) *ast.Symbol {
	if source == nil || name == "" {
		return nil
	}
	key := source.FileName() + "\x00" + name
	if owner.resolving[key] {
		return nil
	}
	owner.resolving[key] = true
	defer delete(owner.resolving, key)
	// Inspect original re-export syntax before GetExportsOfModule can flatten it.
	for _, statement := range source.Statements.Nodes {
		if !ast.IsExportDeclaration(statement) {
			continue
		}
		declaration := statement.AsExportDeclaration()
		if declaration.ExportClause != nil && ast.IsNamedExports(declaration.ExportClause) {
			for _, element := range declaration.ExportClause.AsNamedExports().Elements.Nodes {
				if element.Name().Text() != name {
					continue
				}
				imported := name
				if p := element.AsExportSpecifier().PropertyName; p != nil {
					imported = p.Text()
				}
				if declaration.ModuleSpecifier != nil {
					if selected, owned := owner.selectedModule(statement); owned {
						return owner.exportSymbol(selected, imported, seen)
					}
				} else {
					symbol, _ := owner.symbol(owner.checker.GetExportSpecifierLocalTargetSymbol(element), seen)
					return symbol
				}
			}
		}
	}
	// A checker CJS export view is not proof of the final runtime export slot.
	// Only an inert closed module with one direct object export is proven.
	if source.CommonJSModuleIndicator != nil && !stableCommonJSExport(source, owner.checker) {
		return nil
	}
	module := owner.checker.GetSymbolAtLocation(source.AsNode())
	if module == nil {
		return nil
	}
	for _, symbol := range owner.checker.GetExportsAndPropertiesOfModule(module) {
		if ast.SymbolName(symbol) == name {
			local := false
			for _, declaration := range symbol.Declarations {
				local = local || ast.GetSourceFileOfNode(declaration) == source
			}
			if local {
				selected, _ := owner.symbol(symbol, seen)
				return selected
			}
		}
	}
	// Star exports use the same explicit edge owner. Ambiguous stars remain opaque.
	var result *ast.Symbol
	for _, statement := range source.Statements.Nodes {
		if ast.IsExportDeclaration(statement) && statement.AsExportDeclaration().ExportClause == nil {
			if selected, owned := owner.selectedModule(statement); owned {
				candidate := owner.exportSymbol(selected, name, seen)
				if candidate != nil {
					if result != nil && result != candidate {
						return nil
					}
					result = candidate
				}
			}
		}
	}
	return result
}

func (owner *executableBodyOwner) body(expression *ast.Node) (*ast.Node, bool) {
	definition, owned := owner.definition(expression)
	if definition != nil && !ast.IsFunctionLike(definition) {
		return nil, owned
	}
	return definition, owned
}

// definition requires one executable declaration, ignoring bodyless overload signatures.
// Constructors and callable bodies share selection, but keep distinct execution semantics.
func (owner *executableBodyOwner) definition(expression *ast.Node) (*ast.Node, bool) {
	if owner == nil || owner.selection == nil {
		return nil, false
	}
	symbol, owned := owner.expressionSymbol(expression, make(map[ast.SymbolId]bool))
	if !owned {
		return nil, false
	}
	var result *ast.Node
	if symbol != nil {
		for _, declaration := range symbol.Declarations {
			if !owner.stableBody(declaration) {
				return nil, true
			}
			if ast.IsVariableDeclaration(declaration) || ast.IsPropertyAssignment(declaration) {
				declaration = unwrapSourceCallableReference(declaration.Initializer())
			}
			if declaration != nil && ((ast.IsFunctionLike(declaration) && declaration.Body() != nil) || ast.IsClassDeclaration(declaration) || ast.IsClassExpression(declaration)) {
				if result != nil && result != declaration {
					return nil, true
				}
				result = declaration
			}
		}
	}
	return result, true
}

func preparedContentRevision(source string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(source)))
}

// expressionSummary consults execution ownership before the authored symbol index.
// An explicit opaque edge suppresses typed-body fallback without granting authority.
func (analysis callableAnalysis) expressionSummary(expression *ast.Node, c *checker.Checker) (CallableSummary, bool) {
	if body, owned := analysis.owner.body(expression); owned {
		summary, exists := analysis.byNode[body]
		return summary, exists
	}
	if summary, exists := analysis.byNode[unwrapSourceCallableReference(expression)]; exists {
		return summary, true
	}
	symbol := resolvedCallableSymbol(callTargetSymbol(expression, c), c)
	if symbol == nil {
		return CallableSummary{}, false
	}
	summary, exists := analysis.bySymbol[ast.GetSymbolId(symbol)]
	return summary, exists
}

// invocationBody keeps runtime-body queries separate from checker signature typing.
func (owner *executableBodyOwner) invocationBody(call *ast.Node, c *checker.Checker) *ast.Node {
	if body, owned := owner.body(policyInvocationTarget(call)); owned {
		return body
	}
	if signature := c.GetResolvedSignature(call); signature != nil {
		return signature.Declaration()
	}
	return nil
}

// stableBody memoizes the existing lexical write proof per declaration in this Program.
// Imported call counts therefore do not multiply full-source stability scans.
func (owner *executableBodyOwner) stableBody(declaration *ast.Node) bool {
	if stable, exists := owner.stableBodies[declaration]; exists {
		return stable
	}
	source := ast.GetSourceFileOfNode(declaration)
	stable := source != nil
	if stable && declaration.Name() != nil {
		if symbol := owner.checker.GetSymbolAtLocation(declaration.Name()); symbol != nil {
			stable = !componentValueSymbolIsWrittenAfter(symbol, 0, source, owner.checker)
		}
	}
	owner.stableBodies[declaration] = stable
	return stable
}

// stableCommonJSExport proves an inert module initialization: local function declarations
// and one shorthand object export. No other top-level execution is admitted, including
// apparently unrelated calls or read-only cache access. Function references must resolve
// to lexical declarations inside this source. Checker-synthesized CJS export declarations
// do not establish a lexical binding for deferred wrapper/loader access.
// This is bounded source proof, not a CJS evaluator or proof against external interference.
func stableCommonJSExport(source *ast.SourceFile, c *checker.Checker) bool {
	var export *ast.Node
	for _, statement := range source.Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) && statement.Body() != nil {
			// The only admitted local declarations cannot shadow the CJS wrapper receiver.
			if statement.Name() != nil && statement.Name().Text() == "module" {
				return false
			}
			continue
		}
		if !ast.IsExpressionStatement(statement) {
			return false
		}
		expression := statement.AsExpressionStatement().Expression
		if !ast.IsBinaryExpression(expression) || export != nil {
			return false
		}
		assignment := expression.AsBinaryExpression()
		if assignment.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsPropertyAccessExpression(assignment.Left) ||
			!ast.IsIdentifier(assignment.Left.Expression()) || assignment.Left.Expression().Text() != "module" || assignment.Left.Name().Text() != "exports" || !ast.IsObjectLiteralExpression(assignment.Right) {
			return false
		}
		for _, property := range assignment.Right.AsObjectLiteralExpression().Properties.Nodes {
			if !ast.IsShorthandPropertyAssignment(property) {
				return false
			}
		}
		export = assignment.Left.Expression()
	}
	if export == nil {
		return false
	}
	stable := true
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		shorthand := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent)
		if !ast.IsIdentifier(node) || (ast.IsDeclarationName(node) && !shorthand) || isStaticPropertyName(node) || node == export {
			return true
		}
		symbol := c.GetSymbolAtLocation(node)
		if shorthand {
			symbol = c.GetShorthandAssignmentValueSymbol(node.Parent)
		}
		if symbol == nil || len(symbol.Declarations) == 0 {
			stable = false
		} else {
			for _, declaration := range symbol.Declarations {
				stable = stable && ast.GetSourceFileOfNode(declaration) == source &&
					(ast.IsFunctionDeclaration(declaration) || ast.IsFunctionExpression(declaration) ||
						ast.IsVariableDeclaration(declaration) || ast.IsParameterDeclaration(declaration) ||
						ast.IsBindingElement(declaration) || ast.IsClassDeclaration(declaration) || ast.IsClassExpression(declaration))
			}
		}
		return stable
	})
	return stable
}

// executableDeclarationReference keeps declaration module-edge syntax shared with
// occurrence-local startup fences. Type-only selection remains owned by the caller.
func executableDeclarationReference(node *ast.Node) (*ast.Node, string) {
	switch {
	case ast.IsImportDeclaration(node):
		return node.AsImportDeclaration().ModuleSpecifier, "import"
	case ast.IsExportDeclaration(node):
		return node.AsExportDeclaration().ModuleSpecifier, "import"
	case ast.IsImportEqualsDeclaration(node):
		ref := node.AsImportEqualsDeclaration().ModuleReference
		if ref != nil && ast.IsExternalModuleReference(ref) {
			return ref.AsExternalModuleReference().Expression, "require"
		}
	}
	return nil, "import"
}

// ExecutableSlotFact lets build adapters resolve the same syntax slots the native
// body owner validates. Type-only slots never request runtime module authority.
type ExecutableSlotFact struct {
	Slot      int    `json:"slot"`
	Specifier string `json:"specifier"`
	Kind      string `json:"kind"`
	TypeOnly  bool   `json:"typeOnly"`
}

func executableSlotFacts(source *ast.SourceFile) []ExecutableSlotFact {
	slots := executableSlots(source)
	result := make([]ExecutableSlotFact, 0, len(slots))
	for index, slot := range slots {
		typeOnly := false
		if ast.IsImportDeclaration(slot.node) {
			clause := slot.node.AsImportDeclaration().ImportClause
			typeOnly = clause != nil && !importHasRuntimeBinding(clause)
		} else if ast.IsExportDeclaration(slot.node) {
			typeOnly = !exportHasRuntimeBinding(slot.node.AsExportDeclaration())
		}
		result = append(result, ExecutableSlotFact{index, slot.specifier, slot.kind, typeOnly})
	}
	return result
}
