package exactcompiler

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

func (lowering *jsxLowering) reactiveExpression(
	source *ast.Node,
	expression *ast.Node,
) *ast.Node {
	return lowering.reactiveExpressionMode(source, expression, false)
}

func (lowering *jsxLowering) reactiveExpressionMode(
	source *ast.Node,
	expression *ast.Node,
	forwardLiveSlot bool,
) *ast.Node {
	// A module-owned collection is stable, so values derived only from its callback
	// parameters do not need subscriptions. Captures from the component are different:
	// suppressing their wrappers freezes child props at the collection's first render.
	if lowering.declarativeRenderDepth > 0 && !lowering.hasReactiveComponentCapture(source) {
		return expression
	}
	closure := lowering.reactiveClosure(source)
	if closure == nil {
		closure = lowering.arrow(expression)
	}
	helper := lowering.names.expression
	if forwardLiveSlot && lowering.liveSlotForwarding(source) {
		helper = lowering.names.forwardedExpression
	}
	value := lowering.call(
		helper,
		[]*ast.Node{closure},
	)
	if paths, direct := lowering.componentExecutionOutputPaths(source); len(paths) != 0 &&
		lowering.contractProjection != ComponentContractProjectionHydrate {
		pathValue := lowering.factory.NewStringLiteral(paths[0], ast.TokenFlagsNone)
		if !direct {
			values := make([]*ast.Node, len(paths))
			for index, path := range paths {
				values[index] = lowering.factory.NewStringLiteral(path, ast.TokenFlagsNone)
			}
			pathValue = lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			)
		}
		helper := lowering.names.componentOutput
		if lowering.directServerArtifactComponent(source) {
			helper = lowering.names.serverComponentOutput
		} else if lowering.directServerFrameComponent(source) {
			return value
		}
		return lowering.call(helper, []*ast.Node{
			lowering.factory.NewThisExpression(),
			pathValue,
			value,
		})
	}
	return value
}

func (lowering *jsxLowering) hasReactiveComponentCapture(source *ast.Node) bool {
	compiledHelper := lowering.compilerOwnedRenderHelperCall(source)
	start := sort.Search(len(lowering.reactiveCaptureSpans), func(index int) bool {
		return lowering.reactiveCaptureSpans[index].Start >= source.Pos()
	})
	for index := start; index < len(lowering.reactiveCaptureSpans); index++ {
		span := lowering.reactiveCaptureSpans[index]
		if span.Start >= source.End() {
			break
		}
		if span.Start+span.Length <= source.End() {
			if compiledHelper && spanInsideNestedCallable(source, span.Start, span.Length) {
				continue
			}
			return true
		}
	}
	// A statically resolved JSX helper is compiled into its own target artifact. Passing the
	// durable state facade into that helper does not make the component output unstructured: the
	// helper's generated readers subscribe to the facade's individual fields and return one finite
	// render-program invocation. The owning component can therefore execute its render arrow once.
	if compiledHelper {
		return false
	}
	// Passing the component state facade into a render helper is itself a live
	// capture even when individual property reads occur inside the callee. The
	// helper call must remain an owned component-range reader until its body is
	// specialized into the caller's render program.
	stateRoot := false
	walkNode(source, func(node *ast.Node) bool {
		if stateRoot || !ast.IsPropertyAccessExpression(node) {
			return !stateRoot
		}
		access := node.AsPropertyAccessExpression()
		if access.Name() != nil && access.Name().Text() == "state" &&
			access.Expression.Kind == ast.KindThisKeyword {
			stateRoot = true
			return false
		}
		return true
	})
	if stateRoot {
		return true
	}
	return false
}

// indexReactiveCaptureSpans prepares the source-order membership index shared by reactive JSX
// decisions. A source file can contain hundreds of expressions; repeatedly scanning every state
// read and binding reference for each one makes lowering quadratic in authored module size.
func indexReactiveCaptureSpans(
	stateReads []StateRead,
	bindings []ReactiveBinding,
) []SourceSpan {
	spans := make([]SourceSpan, 0, len(stateReads)+len(bindings))
	for _, read := range stateReads {
		spans = append(spans, SourceSpan{Start: read.Start, Length: read.Length})
	}
	for _, binding := range bindings {
		if binding.Provenance != "props" && binding.Provenance != "context" &&
			binding.Provenance != "derived" && binding.Provenance != "cell" {
			continue
		}
		spans = append(spans, binding.References...)
	}
	sort.Slice(spans, func(left int, right int) bool {
		if spans[left].Start != spans[right].Start {
			return spans[left].Start < spans[right].Start
		}
		return spans[left].Length < spans[right].Length
	})
	return spans
}

// spanInsideNestedCallable distinguishes deferred handler/task bodies passed to a compiled render
// helper from eager argument evaluation. Deferred reads do not require re-entering the helper;
// direct scalar arguments still select the component range because they are snapshots.
func spanInsideNestedCallable(source *ast.Node, start int, length int) bool {
	inside := false
	walkNode(source, func(node *ast.Node) bool {
		if inside {
			return false
		}
		if node != source && ast.IsFunctionLike(node) &&
			start >= node.Pos() && start+length <= node.End() {
			inside = true
			return false
		}
		return true
	})
	return inside
}

// compilerOwnedRenderHelperCall proves that a direct call resolves to authored JSX which the
// project compiler will lower for the same target. Declaration-only and opaque package functions
// remain conservative because their implementation artifact cannot be proven from this program.
func (lowering *jsxLowering) compilerOwnedRenderHelperCall(source *ast.Node) bool {
	if lowering.checker == nil {
		return false
	}
	expression := unwrapRenderExpression(source)
	if !ast.IsCallExpression(expression) {
		return false
	}
	call := expression.AsCallExpression()
	symbol := resolvedCallableSymbol(
		callTargetSymbol(call.Expression, lowering.checker),
		lowering.checker,
	)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		callable := declaration
		if ast.IsVariableDeclaration(declaration) {
			callable = declaration.AsVariableDeclaration().Initializer
		}
		if callable == nil ||
			(!ast.IsFunctionDeclaration(callable) &&
				!ast.IsFunctionExpression(callable) &&
				!ast.IsArrowFunction(callable)) {
			continue
		}
		file := ast.GetSourceFileOfNode(callable)
		if file != nil && !file.IsDeclarationFile && directlyReturnsRenderedValue(callable) {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) liveSlotForwarding(source *ast.Node) bool {
	root := source
	for ast.IsPropertyAccessExpression(root) {
		root = root.AsPropertyAccessExpression().Expression
	}
	for ast.IsElementAccessExpression(root) {
		root = root.AsElementAccessExpression().Expression
	}
	if !ast.IsIdentifier(root) || lowering.checker == nil || ast.GetSourceFileOfNode(root) == nil {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(root)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		name := declaration.Name()
		if name == nil {
			continue
		}
		for _, binding := range lowering.bindings {
			if binding.Start == name.Pos() &&
				(binding.Provenance == "props" || binding.Provenance == "cell") {
				return true
			}
		}
	}
	return false
}

// componentExecutionOutputPaths recognizes state values whose pending
// generations must remain attached when a scalar or aggregate value is forwarded.
func (lowering *jsxLowering) componentExecutionOutputPaths(source *ast.Node) ([]string, bool) {
	paths := []string{}
	seen := make(map[string]bool)
	direct := false
	for _, read := range lowering.stateReads {
		if read.Start < source.Pos() || read.Start+read.Length > source.End() ||
			read.Confidence != "exact" {
			continue
		}
		component, exists := lowering.components[read.Component]
		if !exists {
			continue
		}
		path := strings.Join(read.Path, ".")
		for _, port := range component.Execution.Ports {
			if port.Kind == "state" && port.Path == path &&
				(port.Direction == "output" || port.Direction == "inout") {
				if !seen[path] {
					seen[path] = true
					paths = append(paths, path)
					direct = read.Start == source.Pos() && read.Length == source.End()-source.Pos()
				}
				break
			}
		}
	}
	return paths, len(paths) == 1 && direct
}

type materializedRenderLocal struct {
	symbol      ast.SymbolId
	declaration *ast.Node
	name        string
	cached      bool
	narrowed    bool
}

// reactiveClosure moves render-local pure calculations into the reactive
// callback that consumes them. Closing over their first render value would
// retain a stale snapshot after a dependency changes.
func (lowering *jsxLowering) reactiveClosure(
	expression *ast.Node,
) *ast.Node {
	scope := enclosingCallableNode(expression)
	if scope == nil || lowering.checker == nil {
		return nil
	}
	bySymbol := make(map[ast.SymbolId]materializedRenderLocal)
	walkNode(expression, func(node *ast.Node) bool {
		// Nested JSX expressions receive their own reactive closures during child lowering.
		// Pulling their derived locals into this closure would broaden the outer dependency
		// set and reconcile an entire conditional branch for a leaf-only update.
		if node != expression && ast.IsJsxExpression(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := lowering.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		if _, exists := bySymbol[id]; exists {
			return true
		}
		if local, exists := lowering.elidedDerivedLocal(symbol); exists {
			bySymbol[id] = local
			return true
		}
		for _, declaration := range symbol.Declarations {
			if !ast.IsVariableDeclaration(declaration) ||
				enclosingCallableNode(declaration) != scope {
				continue
			}
			variable := declaration.AsVariableDeclaration()
			name := variable.Name()
			if variable.Initializer == nil || name == nil ||
				!ast.IsIdentifier(name) ||
				!safeReactiveInitializer(
					variable.Initializer,
					lowering.sourceFile,
					lowering.checker,
				) {
				continue
			}
			bySymbol[id] = materializedRenderLocal{
				symbol:      id,
				declaration: declaration,
				name:        lowering.materializedName(name.Text(), name.Pos()),
			}
			break
		}
		return true
	})
	queue := make([]materializedRenderLocal, 0, len(bySymbol))
	for _, local := range bySymbol {
		queue = append(queue, local)
	}
	for len(queue) != 0 {
		local := queue[0]
		queue = queue[1:]
		if local.cached {
			continue
		}
		initializer := local.declaration.AsVariableDeclaration().Initializer
		walkNode(initializer, func(node *ast.Node) bool {
			if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
				isStaticPropertyName(node) {
				return true
			}
			symbol := lowering.checker.GetSymbolAtLocation(node)
			if symbol == nil {
				return true
			}
			id := ast.GetSymbolId(symbol)
			if _, exists := bySymbol[id]; exists {
				return true
			}
			if dependency, exists := lowering.elidedDerivedLocal(symbol); exists {
				bySymbol[id] = dependency
				queue = append(queue, dependency)
			}
			return true
		})
	}
	for symbol, local := range lowering.cachedDerivedLocals(expression) {
		if _, exists := bySymbol[symbol]; !exists {
			bySymbol[symbol] = local
		}
	}
	return lowering.materializedClosure(expression, bySymbol)
}

// cachedDerivedLocals identifies retained derived values whose repeated reads
// belong to one eager reactive evaluation. Reading the cell once preserves
// TypeScript control-flow narrowing and avoids redundant get calls.
func (lowering *jsxLowering) cachedDerivedLocals(
	expression *ast.Node,
) map[ast.SymbolId]materializedRenderLocal {
	locals := make(map[ast.SymbolId]materializedRenderLocal)
	counts := make(map[ast.SymbolId]int)
	walkNode(expression, func(node *ast.Node) bool {
		if node != expression && isCallableNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		if _, exists := lowering.derivedBindingAtReference(node); !exists {
			return true
		}
		symbol := lowering.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		counts[id]++
		if _, exists := locals[id]; exists {
			return true
		}
		for _, declaration := range symbol.Declarations {
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			name := declaration.AsVariableDeclaration().Name()
			if name == nil || !ast.IsIdentifier(name) {
				continue
			}
			clockDerived := lowering.timeActivation != "" &&
				timeExpressionHasClockDependency(
					declaration.AsVariableDeclaration().Initializer,
					lowering.checker,
					lowering.sourceFile,
					make(map[ast.SymbolId]struct{}),
				)
			localName := lowering.cachedDerivedName(name.Text(), name.Pos())
			if clockDerived {
				localName = lowering.materializedName(name.Text(), name.Pos())
			}
			locals[id] = materializedRenderLocal{
				symbol:      id,
				declaration: declaration,
				name:        localName,
				cached:      !clockDerived,
				narrowed:    referenceNarrowsNullish(node, name, lowering.checker),
			}
			break
		}
		return true
	})
	for symbol := range locals {
		if counts[symbol] < 2 && !locals[symbol].narrowed {
			delete(locals, symbol)
		}
	}
	return locals
}

func (lowering *jsxLowering) materializedClosure(
	expression *ast.Node,
	bySymbol map[ast.SymbolId]materializedRenderLocal,
) *ast.Node {
	if len(bySymbol) == 0 {
		return nil
	}
	locals := make([]materializedRenderLocal, 0, len(bySymbol))
	for _, local := range bySymbol {
		locals = append(locals, local)
	}
	sort.Slice(locals, func(left int, right int) bool {
		return locals[left].declaration.Pos() < locals[right].declaration.Pos()
	})
	statements := make([]*ast.Node, 0, len(locals)+1)
	for _, local := range locals {
		variable := local.declaration.AsVariableDeclaration()
		var initializer *ast.Node
		if local.cached {
			initializer = lowering.derivedGet(
				lowering.factory.NewIdentifier(variable.Name().Text()),
			)
			if local.narrowed {
				initializer = lowering.factory.NewNonNullExpression(initializer, ast.NodeFlagsNone)
			}
		} else {
			initializer = lowering.replaceMaterializedReferences(
				variable.Initializer,
				bySymbol,
			)
		}
		statements = append(
			statements,
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							lowering.factory.NewIdentifier(local.name),
							nil,
							variable.Type,
							initializer,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
	}
	value := lowering.replaceMaterializedReferences(expression, bySymbol)
	statements = append(statements, lowering.factory.NewReturnStatement(value))
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(
			lowering.factory.NewNodeList(statements),
			true,
		),
	)
}

func referenceNarrowsNullish(reference *ast.Node, declaration *ast.Node, typeChecker *checker.Checker) bool {
	declared := typeChecker.GetTypeAtLocation(declaration)
	narrowed := typeChecker.GetTypeAtLocation(reference)
	return typeHasNullishMember(declared) && !typeHasNullishMember(narrowed)
}

func typeHasNullishMember(value *checker.Type) bool {
	for _, member := range value.Distributed() {
		if member.Flags()&(checker.TypeFlagsNull|checker.TypeFlagsUndefined) != 0 {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) elidedDerivedLocal(
	symbol *ast.Symbol,
) (materializedRenderLocal, bool) {
	id := ast.GetSymbolId(symbol)
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		variable := declaration.AsVariableDeclaration()
		name := variable.Name()
		if variable.Initializer == nil || name == nil || !ast.IsIdentifier(name) {
			continue
		}
		if _, exists := lowering.elidedDerived[name.Pos()]; !exists {
			continue
		}
		return materializedRenderLocal{
			symbol:      id,
			declaration: declaration,
			name:        lowering.materializedName(name.Text(), name.Pos()),
		}, true
	}
	return materializedRenderLocal{}, false
}

func enclosingCallableNode(node *ast.Node) *ast.Node {
	for current := node.Parent; current != nil; current = current.Parent {
		if isCallableNode(current) ||
			ast.IsMethodDeclaration(current) ||
			ast.IsGetAccessorDeclaration(current) ||
			ast.IsSetAccessorDeclaration(current) {
			return current
		}
	}
	return nil
}

func (lowering *jsxLowering) materializedName(
	name string,
	start int,
) string {
	if existing := lowering.materializedNames[start]; existing != "" {
		return existing
	}
	base := "__exact_" + name + "_"
	index := 1
	candidate := base + strconv.Itoa(index)
	used := func(name string) bool {
		if strings.Contains(lowering.sourceFile.Text(), name) {
			return true
		}
		for _, existing := range lowering.materializedNames {
			if existing == name {
				return true
			}
		}
		return false
	}
	for used(candidate) {
		index++
		candidate = base + strconv.Itoa(index)
	}
	lowering.materializedNames[start] = candidate
	return candidate
}

func (lowering *jsxLowering) cachedDerivedName(
	name string,
	start int,
) string {
	if existing := lowering.cachedDerivedNames[start]; existing != "" {
		return existing
	}
	base := "__exact_cached_" + name + "_"
	index := 1
	candidate := base + strconv.Itoa(index)
	for strings.Contains(lowering.sourceFile.Text(), candidate) {
		index++
		candidate = base + strconv.Itoa(index)
	}
	lowering.cachedDerivedNames[start] = candidate
	return candidate
}

func (lowering *jsxLowering) replaceMaterializedReferences(
	root *ast.Node,
	locals map[ast.SymbolId]materializedRenderLocal,
) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
				!isStaticPropertyName(node) {
				symbol := lowering.checker.GetSymbolAtLocation(node)
				if symbol != nil {
					if local, exists := locals[ast.GetSymbolId(symbol)]; exists {
						return lowering.factory.NewIdentifier(local.name)
					}
				}
			}
			updated := visitor.VisitEachChild(node)
			if updated != node {
				if identity := lowering.nodeIDs[node]; identity != "" {
					lowering.nodeIDs[updated] = identity
				}
			}
			return updated
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	return lowering.visitor.VisitNode(visitor.VisitNode(root))
}

func (lowering *jsxLowering) lowerReactiveCapture(node *ast.Node) *ast.Node {
	var callee *ast.Node
	var value *ast.Node
	var typeArguments *ast.NodeList
	var flags ast.NodeFlags
	switch {
	case ast.IsCallExpression(node):
		call := node.AsCallExpression()
		if !componentReactiveMember(call.Expression) ||
			call.Arguments == nil ||
			len(call.Arguments.Nodes) != 1 {
			return nil
		}
		value = call.Arguments.Nodes[0]
		if ast.IsArrowFunction(value) || ast.IsFunctionExpression(value) {
			return nil
		}
		callee = call.Expression
		typeArguments = call.TypeArguments
		flags = call.Flags
	case ast.IsTaggedTemplateExpression(node):
		tagged := node.AsTaggedTemplateExpression()
		if !componentReactiveMember(tagged.Tag) {
			return nil
		}
		callee = tagged.Tag
		value = tagged.Template
		typeArguments = tagged.TypeArguments
		flags = tagged.Flags
	default:
		return nil
	}
	return lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(callee),
		nil,
		typeArguments,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.arrow(lowering.visitor.VisitNode(value)),
		}),
		flags,
	)
}

func componentReactiveMember(expression *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	return member.Expression.Kind == ast.KindThisKeyword &&
		member.Name() != nil &&
		member.Name().Text() == "reactive"
}
