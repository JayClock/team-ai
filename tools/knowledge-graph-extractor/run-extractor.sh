#!/bin/bash

# Knowledge Graph Extractor Runner Script

# Default values
NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-password}"
CLEAR_DB="${CLEAR_DB:-false}"
PROJECT_PATH="${PROJECT_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "=== Knowledge Graph Extractor ==="
echo "Neo4j URI: $NEO4J_URI"
echo "Project Path: $PROJECT_PATH"
echo "Clear Database: $CLEAR_DB"
echo ""

# Run the extractor
./gradlew :tools:knowledge-graph-extractor:run \
  -Dproject.path="$PROJECT_PATH" \
  -Dneo4j.uri="$NEO4J_URI" \
  -Dneo4j.user="$NEO4J_USER" \
  -Dneo4j.password="$NEO4J_PASSWORD" \
  -Dneo4j.clear="$CLEAR_DB"
