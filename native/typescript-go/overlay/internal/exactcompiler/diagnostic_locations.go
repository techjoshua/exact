package exactcompiler

// remapDiagnosticLocations finalizes diagnostic coordinates for JavaScript clients.
// Analysis and lowering retain byte offsets. Diagnostics cross the process boundary
// as UTF-16 offsets, after normalization and generated-source mapping have finished.
// Imported files must use their own text rather than the caller's normalization map.
func remapDiagnosticLocations(diagnostics []Diagnostic, filename string, source normalizedSource, sourceCount int) {
	for index := range diagnostics {
		diagnostic := &diagnostics[index]
		text := diagnostic.source
		local := diagnostic.FileName == "" || diagnostic.FileName == filename
		if local {
			text = source.authored
			if index < sourceCount {
				diagnostic.Start, diagnostic.Length = source.authoredSpan(diagnostic.Start, diagnostic.Length)
				if diagnostic.FixText != "" {
					diagnostic.FixStart = source.authoredOffset(diagnostic.FixStart)
				}
			}
		}
		if text != "" {
			diagnostic.Line, diagnostic.Column = diagnosticLineColumn(text, diagnostic.Start)
			diagnostic.Start, diagnostic.Length = diagnosticUTF16Span(text, diagnostic.Start, diagnostic.Length)
			if diagnostic.FixText != "" {
				diagnostic.FixStart, _ = diagnosticUTF16Span(text, diagnostic.FixStart, 0)
			}
		}
		for index := range diagnostic.Related {
			related := &diagnostic.Related[index]
			relatedText := related.source
			if related.FileName == filename {
				relatedText = source.authored
				related.Start, related.Length = source.authoredSpan(related.Start, related.Length)
			}
			if relatedText != "" {
				related.Line, related.Column = diagnosticLineColumn(relatedText, related.Start)
				related.Start, related.Length = diagnosticUTF16Span(relatedText, related.Start, related.Length)
			}
		}
	}
}

func diagnosticUTF16Span(text string, start, length int) (int, int) {
	start = max(0, min(start, len(text)))
	end := max(start, min(start+length, len(text)))
	return utf16Length(text[:start]), utf16Length(text[start:end])
}

func diagnosticLineColumn(text string, offset int) (int, int) {
	line, column := sourceUTF16LineColumn(text, max(0, offset))
	return line + 1, column + 1
}
