#!/bin/bash

# Neo4j Query Runner

NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-password}"

echo "=== Neo4j Query Runner ==="
echo "Neo4j URI: $NEO4J_URI"
echo ""

# Run the query runner
./gradlew :tools:knowledge-graph-extractor:run \
  -DmainClass=reengineering.ddd.knowledgegraph.neo4j.CypherQueryRunner \
  -Dneo4j.uri="$NEO4J_URI" \
  -Dneo4j.user="$NEO4J_USER" \
  -Dneo4j.password="$NEO4J_PASSWORD"
