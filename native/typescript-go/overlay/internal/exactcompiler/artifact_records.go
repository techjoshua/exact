package exactcompiler

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
)

// createArtifactRecords materializes target-neutral symbol ownership and DOM
// split boundaries before either artifact is printed.
func createArtifactRecords(
	sourceFile *ast.SourceFile,
	components []Component,
	callables []CallableSummary,
	exports []ExportRecord,
	clientIslands map[*ast.Node]clientElementIsland,
) ([]SymbolRecord, []Boundary) {
	filename := sourceFile.FileName()
	symbols := []SymbolRecord{}
	boundaries := []Boundary{}
	seenBoundaries := map[string]struct{}{}
	renderNodes := indexJSXRenderNodes(sourceFile)
	defaultComponents := make(map[int]struct{})
	for _, candidate := range activeComponentCandidates(sourceFile) {
		if ast.HasSyntacticModifier(candidate.node, ast.ModifierFlagsDefault) {
			defaultComponents[candidate.node.Pos()] = struct{}{}
		}
	}
	elementIslands := make(map[string]clientElementIsland)
	for _, island := range clientIslands {
		elementIslands[island.component.ID+":"+strconv.Itoa(island.index)] = island
	}
	for _, component := range components {
		target := "both"
		if len(component.ArtifactTargets) == 1 {
			target = component.ArtifactTargets[0]
		}
		if component.Exported {
			exportName := component.Name
			for _, exported := range exports {
				if exported.Kind == "component" &&
					exported.LocalName == component.Name {
					exportName = exported.Name
					break
				}
			}
			if _, isDefault := defaultComponents[component.Start]; isDefault {
				exportName = "default"
			}
			symbols = append(symbols, SymbolRecord{
				ID: exactStableID(
					filename,
					"symbol",
					component.ID,
					"root",
					component.Name,
				),
				ComponentID:   component.ID,
				ExportName:    exportName,
				LocalName:     component.Name,
				GeneratedName: component.Name,
				DebugName:     component.Name,
				Kind:          "component",
				Role:          "root",
				Target:        target,
				Placement:     component.Placement,
			})
		}
		if component.Exported && component.Placement != "client" &&
			component.ClientIslandCount > 0 {
			name := generatedComponentName(component.Name, "server-part", 1)
			symbols = append(symbols, SymbolRecord{
				ID: exactStableID(
					filename,
					component.Name,
					"server-part",
					"1",
				),
				ComponentID:   component.ID,
				ExportName:    name,
				LocalName:     component.Name,
				GeneratedName: name,
				DebugName:     component.Name + ":server-part:1",
				Kind:          "component",
				Role:          "server-part",
				Target:        "server",
				Placement:     component.Placement,
			})
		}
		if component.Exported {
			for index := 1; index <= component.ClientIslandCount; index++ {
				island, hasIsland := elementIslands[component.ID+":"+strconv.Itoa(index)]
				name := generatedComponentName(
					component.Name,
					"client-island",
					index,
				)
				id := exactStableID(
					filename,
					component.Name,
					"client-island",
					strconv.Itoa(index),
				)
				symbols = append(symbols, SymbolRecord{
					ID:            id,
					ComponentID:   component.ID,
					ExportName:    name,
					LocalName:     name,
					GeneratedName: name,
					DebugName: component.Name +
						":client-island:" + strconv.Itoa(index),
					Kind:      "component",
					Role:      "client-island",
					Target:    "client",
					Placement: "client",
				})
				boundaries = appendUniqueBoundary(
					boundaries,
					seenBoundaries,
					Boundary{
						ID:               id,
						Name:             name,
						ComponentID:      component.ID,
						OwnerComponentID: component.ID,
						Kind:             "client-island",
						Activation: func() *ActivationDecision {
							if !hasIsland {
								return nil
							}
							decision := island.activation
							return &decision
						}(),
					},
				)
				if hasIsland && island.serverSlot {
					boundaries = appendUniqueBoundary(
						boundaries,
						seenBoundaries,
						Boundary{
							ID:               id + ":children",
							Name:             name + ":children",
							ComponentID:      component.ID,
							OwnerComponentID: component.ID,
							Kind:             "server-slot",
						},
					)
				}
			}
		}
		if component.Exported && component.Placement == "client" {
			id := exactStableID(
				filename,
				component.Name,
				"component-island",
			)
			boundaries = appendUniqueBoundary(
				boundaries,
				seenBoundaries,
				Boundary{
					ID:               id,
					Name:             component.Name,
					ComponentID:      component.ID,
					OwnerComponentID: component.ID,
					Kind:             "client-island",
				},
			)
		}
		for _, edge := range component.RenderEdges {
			if edge.Placement != "client" || edge.NodeID == "" {
				continue
			}
			id := exactStableID(
				filename,
				edge.Name,
				"component-island",
				edge.NodeID,
			)
			boundaries = appendUniqueBoundary(
				boundaries,
				seenBoundaries,
				Boundary{
					ID:               id,
					Name:             edge.Name,
					ComponentID:      edge.ComponentID,
					OwnerComponentID: component.ID,
					RenderEdgeID:     edge.ID,
					RenderEdgeIndex:  edge.Index,
					RenderPath:       edge.Path,
					Kind:             "client-island",
				},
			)
			if node := renderNodes[edge.Path]; node != nil &&
				ast.IsJsxElement(node) &&
				jsxChildrenRequireServerSlot(node.AsJsxElement().Children) {
				boundaries = appendUniqueBoundary(
					boundaries,
					seenBoundaries,
					Boundary{
						ID:               id + ":children",
						Name:             edge.Name + ":children",
						ComponentID:      edge.ComponentID,
						OwnerComponentID: component.ID,
						RenderEdgeID:     edge.ID,
						RenderEdgeIndex:  edge.Index,
						RenderPath:       edge.Path,
						Kind:             "server-slot",
					},
				)
			}
		}
	}
	componentExports := make(map[string]struct{})
	for _, component := range components {
		if component.Exported {
			componentExports[component.Name] = struct{}{}
		}
	}
	for _, callable := range callables {
		for _, exportName := range callable.ExportNames {
			if _, component := componentExports[exportName]; component ||
				len(callable.ArtifactTargets) == 0 {
				continue
			}
			placement := "unknown"
			switch {
			case callable.Effect == "browser" ||
				(len(callable.ArtifactTargets) == 1 &&
					callable.ArtifactTargets[0] == "client"):
				placement = "client"
			case callable.Effect == "server" ||
				(len(callable.ArtifactTargets) == 1 &&
					callable.ArtifactTargets[0] == "server"):
				placement = "server"
			case callable.Effect == "neutral":
				placement = "isomorphic"
			}
			localName := callable.Name
			if callable.Kind == "initializer" {
				localName = strings.TrimSuffix(
					localName,
					".initializer",
				)
			}
			target := "both"
			if len(callable.ArtifactTargets) == 1 {
				target = callable.ArtifactTargets[0]
			}
			symbols = append(symbols, SymbolRecord{
				ID: exactStableID(
					filename,
					"symbol",
					callable.ID,
					"root",
					exportName,
				),
				ExportName:    exportName,
				LocalName:     localName,
				GeneratedName: localName,
				DebugName:     localName,
				Kind:          "value",
				Role:          "root",
				Target:        target,
				Placement:     placement,
			})
		}
	}
	recordedExports := make(map[string]struct{}, len(symbols))
	for _, symbol := range symbols {
		recordedExports[symbol.ExportName] = struct{}{}
	}
	for _, exported := range exports {
		if _, exists := recordedExports[exported.Name]; exists {
			continue
		}
		target := "both"
		switch exported.Placement {
		case "client":
			target = "client"
		case "server":
			target = "server"
		}
		symbols = append(symbols, SymbolRecord{
			ID:            exactStableID(filename, "symbol", "export", exported.Name),
			ExportName:    exported.Name,
			LocalName:     exported.LocalName,
			GeneratedName: exported.LocalName,
			DebugName:     exported.LocalName,
			Kind:          exported.Kind,
			Role:          "root",
			Target:        target,
			Placement:     exported.Placement,
		})
	}
	sort.Slice(symbols, func(left int, right int) bool {
		if symbols[left].ComponentID == symbols[right].ComponentID &&
			symbols[left].Role == "client-island" &&
			symbols[right].Role == "client-island" {
			return symbols[left].GeneratedName < symbols[right].GeneratedName
		}
		return symbols[left].ID < symbols[right].ID
	})
	return symbols, boundaries
}

func indexJSXRenderNodes(sourceFile *ast.SourceFile) map[string]*ast.Node {
	result := make(map[string]*ast.Node)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsJsxElement(node) || ast.IsJsxSelfClosingElement(node) {
			result[fmt.Sprintf("%d", node.Pos())] = node
		}
		return true
	})
	return result
}

func appendUniqueBoundary(
	boundaries []Boundary,
	seen map[string]struct{},
	boundary Boundary,
) []Boundary {
	if _, exists := seen[boundary.ID]; exists {
		return boundaries
	}
	seen[boundary.ID] = struct{}{}
	return append(boundaries, boundary)
}

func generatedComponentName(author string, role string, index int) string {
	base := sanitizeGeneratedIdentifier(author)
	suffix := "ExactClient"
	if role == "server-part" {
		suffix = "ExactServer"
	}
	return base + "_" + suffix + "_" + strconv.Itoa(index)
}

func sanitizeGeneratedIdentifier(value string) string {
	var result strings.Builder
	for _, character := range value {
		if character == '_' || character == '$' ||
			unicode.IsLetter(character) || unicode.IsDigit(character) {
			result.WriteRune(character)
		} else {
			result.WriteRune('_')
		}
	}
	cleaned := result.String()
	if cleaned == "" {
		return "Component"
	}
	first := []rune(cleaned)[0]
	if first == '_' || first == '$' || unicode.IsLetter(first) {
		return cleaned
	}
	return "_" + cleaned
}
