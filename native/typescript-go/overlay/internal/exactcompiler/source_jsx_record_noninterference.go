package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/core"
)

// sourceJSXConstructionMode is immutable request/configuration metadata plus a
// generation-local syntax cache. It contains no Get, execution or graph receipt.
// It describes only own receipt construction; child evaluation and target writes
// remain with the original source and renderer owners, including eager SSR work.
type sourceJSXConstructionMode struct {
	generation *projectGeneration
	jsx        core.JsxEmit
	provider   string
	profiles   map[*ast.Node]bool
	records    map[*ast.Node]bool
}

// describeSourceJSXConstruction runs before callable/C admission, using the same
// compile request and configuration later consumed by native JSX lowering.
func describeSourceJSXConstruction(g *projectGeneration, request Request) *sourceJSXConstructionMode {
	if !installedMemberGenerationActive(g) || request.Kind != "compile" || request.JSXInterop != nil || request.ServerComponents || request.ComponentContractProjection != "" && request.ComponentContractProjection != ComponentContractProjectionComplete || g.sourceFile.IsDeclarationFile || g.project.config == nil {
		return nil
	}
	switch request.PackageName {
	case "@exactjs/core", "@exactjs/reactive", "@exactjs/dom", "@exactjs/ssr", "@exactjs/jsx":
		return nil // Provider implementation analysis does not consume its own ABI law.
	}
	options := g.project.config.CompilerOptions()
	if options == nil || options.JsxFactory != "" || options.JsxFragmentFactory != "" || options.JsxImportSource != "" && options.JsxImportSource != "@exactjs/jsx" {
		return nil
	}
	switch options.Jsx {
	case core.JsxEmitPreserve, core.JsxEmitReactJSX, core.JsxEmitReactJSXDev:
	default:
		return nil
	}
	return &sourceJSXConstructionMode{generation: g, jsx: options.Jsx, provider: options.JsxImportSource, profiles: make(map[*ast.Node]bool), records: make(map[*ast.Node]bool)}
}

// intrinsicConstructionProfile recognizes only the existing ordinary nonvoid
// host family with empty props and one checked scalar expression. This static
// classification never says that evaluating the expression is pure or complete.
func (q *sourceValueQuery) intrinsicConstructionProfile(node *ast.Node, result *accessorCandidates) bool {
	if q == nil || node == nil || q.owner == nil || q.owner.generation == nil {
		return false
	}
	mode := q.owner.generation.sourceJSXConstruction
	if mode == nil || mode.generation != q.owner.generation || !q.installedMemberSourceOwned(node) || sourceJSXModeKey(q.owner.generation, ast.GetSourceFileOfNode(node)) == (sourceJSXConstructionKey{}) {
		return false
	}
	if q.executable.project.config == nil {
		return false
	}
	options := q.executable.project.config.CompilerOptions()
	if options == nil || options.Jsx != mode.jsx || options.JsxImportSource != mode.provider || options.JsxFactory != "" || options.JsxFragmentFactory != "" {
		return false
	}
	// Normal per-source component inventory, not a primary-file/caller fact.
	component := false
	for region := enclosingCallableNode(node); region != nil; region = enclosingCallableNode(region) {
		if !q.charge(result, region) {
			return false
		}
		if _, known := q.owner.components[region]; known {
			component = true
			break
		}
	}
	if !component {
		return false
	}
	if value, known := mode.profiles[node]; known {
		return value
	}
	accepted := q.classifyIntrinsicConstruction(node, result)
	mode.profiles[node] = accepted
	return accepted
}

func (q *sourceValueQuery) classifyIntrinsicConstruction(node *ast.Node, result *accessorCandidates) bool {
	if node == nil || !ast.IsJsxElement(node) || !q.charge(result, node) {
		return false
	}
	element := node.AsJsxElement()
	opening, closing := element.OpeningElement, element.ClosingElement
	if opening == nil || closing == nil {
		return false
	}
	tag := openingTag(opening)
	if tag == nil || !ast.IsIdentifier(tag) || !simpleIntrinsicSourceHost(tag.Text()) || tag.Text() == "br" || closing.AsJsxClosingElement().TagName.Text() != tag.Text() || !q.charge(result, tag) {
		return false
	}
	// A lexical microcomponent/value follows a different lowering branch. An
	// intrinsic type-property declaration supplies no authored runtime value.
	if symbol := q.owner.checker.GetSymbolAtLocation(tag); symbol != nil {
		if len(symbol.Declarations) == 0 {
			return false
		}
		for _, declaration := range symbol.Declarations {
			if !q.charge(result, declaration) || declaration.Kind != ast.KindPropertySignature || declaration.Parent == nil || !ast.IsInterfaceDeclaration(declaration.Parent) || callableNameText(declaration.Parent.Name()) != "IntrinsicElements" {
				return false
			}
		}
	}
	attributes := opening.Attributes()
	if attributes == nil || len(attributes.AsJsxAttributes().Properties.Nodes) != 0 {
		return false
	}
	var expression *ast.Node
	for _, child := range element.Children.Nodes {
		if !q.charge(result, child) {
			return false
		}
		if ast.IsJsxText(child) && strings.TrimSpace(child.Text()) == "" {
			continue
		}
		if expression != nil || !ast.IsJsxExpression(child) || child.AsJsxExpression().DotDotDotToken != nil || child.AsJsxExpression().Expression == nil {
			return false
		}
		expression = child.AsJsxExpression().Expression
	}
	return expression != nil && intrinsicConstructionScalar(q.owner.checker.GetTypeAtLocation(expression), q.owner.checker)
}

// jsxConstructionDisjointFromRecord is a conditional category proof at one
// original installed Get, before any C candidate admission. It neither creates
// a normal own-slot fact nor observes a value, selected event or completed body.
func (q *sourceValueQuery) jsxConstructionDisjointFromRecord(node, origin *ast.Node, get *sourceGetInputs, read *sourceMemberWriterReadCut, result *accessorCandidates) bool {
	if q == nil || node == nil || !ast.IsJsxElement(node) || q.owner == nil || q.owner.generation == nil || q.owner.generation.sourceJSXConstruction == nil || q.stagedMember == nil || get == nil || read == nil || origin == nil || !ast.IsObjectLiteralExpression(origin) {
		return false
	}
	b := q.stagedMember
	e := b.installedMember
	if e == nil || e.self != e || result == nil || e.result != result || !q.liveStagedMemberSource(b, get, read) || !q.installedMemberReaderOwned(get, read) || !q.installedMemberReaderEnrollmentOwned(e) || !q.installedMemberInputOwned(e.input) || !q.installedMemberSourceOwned(origin, node, get.operation, q.effectOwner) || !validInstalledMemberApplication(&e.application) {
		return false
	}
	a := &e.application
	if get.constructionEffects != nil || get.hasInstance != nil || get.argumentProjection != nil || get.arrayIndexMay != nil || get.reflective != nil || get.fieldEffects != nil || get.stagedEffects != nil || get.symbol != nil || get.hasOnly || get.ownConditional {
		return false
	}
	if a.phase != installedMemberRead && a.phase != installedMemberAcquire || a.nativeGet.producer.operation != nil || !q.installedAuthoredMemberPhaseOwned(a.request, get, a.phase, a.key) || !sameInstalledMemberRequest(b.request, a.request) || q.memberSourceObservationCut(get, read) != a.memberCut {
		return false
	}
	receiver := a.receiver
	if receiver.kind != relativeEndpointExpression || receiver.expression != origin || get.receiver.node != origin || len(get.receiver.path) != 0 || get.lookupOwner != nil || len(receiver.projection) != 0 || receiver.nativePrimitive != nil || receiver.constructionCallable != nil || receiver.moduleConstruction != nil || receiver.descriptorView != nil || receiver.frameworkView != nil {
		return false
	}
	// The actual visitor constructed a plain source receiver at this branch.
	// Special normal/native/managed values may not borrow this record category.
	if get.receiver.frameworkView != nil || get.receiver.descriptorView != nil || get.receiver.constructionView != nil || get.receiver.constructionCallable != nil || get.receiver.instance != nil || get.receiver.native != nil || get.receiver.normal != nil || get.receiver.acquired != nil || get.receiver.adapter != nil || get.receiver.freezeLexical != nil || get.receiver.ownedGetRow != nil || get.receiver.initializerUse != nil || get.receiver.capture != nil || get.receiver.entrySlot != nil || get.receiver.bound != nil || get.receiver.awaited != nil || get.receiver.constructionGeneration != nil {
		return false
	}
	creator := q.creators[enclosingCallableNode(origin)]
	if receiver.creation != creator.invocation || receiver.returning != creator.returning || receiver.cut != a.memberCut || creator.invocation == nil || creator.returning == nil {
		return false
	}
	if !q.intrinsicConstructionProfile(node, result) || !q.memberOperationDescriptor(origin, a.key, result) {
		return false
	}
	if !q.ordinaryConstructionRecordShape(origin, result) {
		return false
	}
	// A late profile must never remove an admitted/sealed candidate or recertify
	// its old event. A fresh original Get/graph can classify before first admission.
	candidate := sourceStagedMemberCandidate{request: b.request, operation: node, origin: origin, region: enclosingCallableNode(node), protocol: true, prior: !runtimeModuleEvaluation(q.effectOwner), cut: q.memberSourceObservationCut(get, read)}
	if _, registered := e.work.operationRecipes[stagedMemberCandidateRequest(b.request, candidate).producer]; registered {
		return false
	}
	return true
}

// ordinaryConstructionRecordShape caches syntax only, never a live per-Get yes.
func (q *sourceValueQuery) ordinaryConstructionRecordShape(origin *ast.Node, result *accessorCandidates) bool {
	mode := q.owner.generation.sourceJSXConstruction
	if supported, known := mode.records[origin]; known {
		return supported
	}
	supported := q.classifyConstructionRecordShape(origin, result)
	mode.records[origin] = supported
	return supported
}

func (q *sourceValueQuery) classifyConstructionRecordShape(origin *ast.Node, result *accessorCandidates) bool {
	// Narrow the existing initial-data descriptor classification: no accessor,
	// method, duplicate or unsupported member anywhere in this record branch.
	seen := make(map[string]struct{}, len(origin.AsObjectLiteralExpression().Properties.Nodes))
	for _, member := range origin.AsObjectLiteralExpression().Properties.Nodes {
		if !q.charge(result, member) || !ast.IsPropertyAssignment(member) && !ast.IsShorthandPropertyAssignment(member) || member.Name() == nil || (!ast.IsIdentifier(member.Name()) && !ast.IsStringLiteral(member.Name())) {
			return false
		}
		key := callableNameText(member.Name())
		if key == "" || key == "__proto__" {
			return false
		}
		if _, duplicate := seen[key]; duplicate {
			return false
		}
		seen[key] = struct{}{}
	}
	return true
}

// sourceJSXConstructionKey is an input to existing source-analysis cache reuse.
// Equality preserves static semantic mode only, never an execution observation.
type sourceJSXConstructionKey struct {
	source   *ast.SourceFile
	jsx      core.JsxEmit
	provider string
}

func sourceJSXModeKey(g *projectGeneration, source *ast.SourceFile) sourceJSXConstructionKey {
	if !installedMemberGenerationActive(g) || source == nil || source.IsDeclarationFile || source.AsNode().SubtreeFacts()&ast.SubtreeContainsJsx == 0 || g.program.GetSourceFile(source.FileName()) != source || g.project.config == nil {
		return sourceJSXConstructionKey{}
	}
	mode := g.sourceJSXConstruction
	if mode == nil || mode.generation != g {
		return sourceJSXConstructionKey{}
	}
	options := g.project.config.CompilerOptions()
	if options == nil || options.Jsx != mode.jsx || options.JsxImportSource != mode.provider || options.JsxFactory != "" || options.JsxFragmentFactory != "" {
		return sourceJSXConstructionKey{}
	}
	if pragma := ast.GetPragmaFromSourceFile(source, "jsximportsource"); pragma != nil && ast.GetPragmaArgument(pragma, "factory") != "@exactjs/jsx" {
		return sourceJSXConstructionKey{}
	}
	if ast.GetPragmaFromSourceFile(source, "jsx") != nil || ast.GetPragmaFromSourceFile(source, "jsxfrag") != nil {
		return sourceJSXConstructionKey{}
	}
	return sourceJSXConstructionKey{source: source, jsx: mode.jsx, provider: mode.provider}
}

func sameSourceJSXMode(context *callableSourceContext, g *projectGeneration, source *ast.SourceFile) bool {
	prior := sourceJSXConstructionKey{}
	if context != nil {
		prior = context.jsxConstruction
	}
	return prior == sourceJSXModeKey(g, source)
}

// sourceJSXPublicationNeeded extends the existing disposed-language publication
// fence only when static mode inputs genuinely require recollection. Equal
// request modes plus the same Program preserve per-file pragma/source identity;
// ordinary unchanged requests do not scan or reconstruct the cache.
func sourceJSXPublicationNeeded(cache *projectCallableCache, g *projectGeneration) bool {
	if cache == nil || cache.owner == nil || cache.owner.values == nil {
		return false
	}
	prior := cache.owner.values.generation
	modeKey := func(generation *projectGeneration) sourceJSXConstructionKey {
		if generation != nil && generation.sourceJSXConstruction != nil {
			mode := generation.sourceJSXConstruction
			return sourceJSXConstructionKey{jsx: mode.jsx, provider: mode.provider}
		}
		return sourceJSXConstructionKey{}
	}
	if modeKey(prior) == modeKey(g) {
		return false
	}
	for source, analysis := range cache.bySource {
		if !sameSourceJSXMode(analysis.sourceContext, g, source) {
			return true
		}
	}
	return false
}

// Checked primitive representation includes branded strings/numbers. It grants
// no value or getter fact, and never specializes an open generic by its caller.
func intrinsicConstructionScalar(value *checker.Type, c *checker.Checker) bool {
	if value == nil || value.Flags()&(checker.TypeFlagsAnyOrUnknown|checker.TypeFlagsTypeParameter) != 0 {
		return false
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		parts := value.Types()
		for _, part := range parts {
			if !intrinsicConstructionScalar(part, c) {
				return false
			}
		}
		return len(parts) > 0
	}
	if value.Flags()&checker.TypeFlagsIntersection != 0 {
		for _, part := range value.Types() {
			if part.Flags()&(checker.TypeFlagsAnyOrUnknown|checker.TypeFlagsTypeParameter) != 0 {
				return false
			}
		}
	}
	return scalarDerivedType(value) || collectionPrimitiveKeyType(value, c)
}
