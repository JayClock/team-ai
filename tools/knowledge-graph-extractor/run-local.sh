#!/bin/bash

# Local Knowledge Graph Extractor Runner Script

# Default values
PROJECT_PATH="${PROJECT_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_PATH/knowledge-graph}"

echo "=== Local Knowledge Graph Extractor ==="
echo "Project Path: $PROJECT_PATH"
echo "Output Directory: $OUTPUT_DIR"
echo ""

# Run the extractor
./gradlew :tools:knowledge-graph-extractor:extractToLocal \
  -Dproject.path="$PROJECT_PATH" \
  -Doutput.dir="$OUTPUT_DIR"

echo ""
echo "=== Extraction Complete ==="
echo "Output files:"
echo "  - $OUTPUT_DIR/architecture.md (Architecture View)"
echo "  - $OUTPUT_DIR/api-to-database.md (API → Database Flow)"
echo "  - $OUTPUT_DIR/smart-domain.md (Smart Domain Pattern)"
echo "  - $OUTPUT_DIR/interactive.html (Interactive View)"
echo ""
echo "Next steps:"
echo "  1. Open IntelliJ IDEA"
echo "  2. Navigate to $OUTPUT_DIR"
echo "  3. Open any .md file"
echo "  4. Click the 'Preview' button"
echo "  5. Click nodes to navigate to source files"
echo ""
