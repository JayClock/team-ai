# Knowledge Graph Extractor

Extracts code structure and dependencies from the Team AI codebase and builds a knowledge graph. Supports both Neo4j and local (file-based) usage.

## Quick Start

### Local Usage (Recommended for IntelliJ IDEA)

```bash
# Run extractor and export to local files
./tools/knowledge-graph-extractor/run-local.sh

# Or use Gradle directly
./gradlew :tools:knowledge-graph-extractor:extractToLocal
```

This will generate:

- Mermaid files for visualization in IntelliJ IDEA
- JSON files for programmatic access
- Interactive HTML view
- Query results and statistics

**Next steps:**

1. Install Mermaid plugin in IntelliJ IDEA
2. Open generated `.md` files (e.g., `knowledge-graph/architecture.md`)
3. Click "Preview" button to view charts
4. Click nodes to navigate to source files

👉 **For detailed local usage instructions, see [LOCAL_USAGE.md](LOCAL_USAGE.md)**

---

## Neo4j Usage (Database Storage)

### Required Dependencies

1. **Neo4j Database**: Running Neo4j instance (Docker recommended)

   ```bash
   docker run -d \
     --name neo4j \
     -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/password \
     neo4j:5.18
   ```

2. **Java 17+**: For running the extractor

### Running the Extractor with Neo4j

```bash
# Run with default settings (Neo4j at localhost:7687)
./gradlew :tools:knowledge-graph-extractor:run

# Run with custom Neo4j settings
./gradlew :tools:knowledge-graph-extractor:run \
  -Dneo4j.uri=bolt://localhost:7687 \
  -Dneo4j.user=neo4j \
  -Dneo4j.password=your_password

# Clear Neo4j database before extraction
./gradlew :tools:knowledge-graph-extractor:run -Dneo4j.clear=true
```

## Graph Schema

### Nodes

- **Layer**: Architectural layers (API, Domain, Infrastructure)
- **JAXRSResource**: REST API endpoints
- **Entity**: Domain entities
- **DomainInterface**: Domain interfaces (associations, services)
- **AssociationImplementation**: Infrastructure implementations of domain interfaces
- **MyBatisMapper**: MyBatis mapper interfaces
- **XMLMapper**: MyBatis XML mapper files
- **DatabaseTable**: Database tables
- **HATEOASModel**: HATEOAS representation models
- **DTO**: Data Transfer Objects
- **Method**: Class methods
- **ExternalService**: External service abstractions (AI providers)

### Relationships

- **BELONGS_TO**: Node belongs to a layer
- **CONTAINS**: Class contains method/field
- **IMPLEMENTS**: Class implements interface
- **EXTENDS**: Class/interface extends another
- **INJECTS**: Dependency injection
- **CALLS**: Method invokes another method
- **EXPOSES_AS**: Association pattern (e.g., messages() → HasMany)
- **IMPLEMENTED_BY**: Domain interface implemented by infrastructure
- **MAPS_TO**: Mapper operates on database table
- **BINDS_TO**: XML namespace binds to Java mapper
- **GENERATES_LINK**: HATEOAS link generation
- **RETURNS_STREAM**: Returns reactive stream
- **WRITES_TO**: SQL insert/update operations
- **READS_FROM**: SQL select operations
- **OPERATES_ON**: General database operations
- **DEFINES_QUERY**: Mapper method defines SQL query

## Gradle Tasks

### Local Export Tasks

```bash
# Extract and export to local files
./gradlew :tools:knowledge-graph-extractor:extractToLocal

# Run query analysis
./gradlew :tools:knowledge-graph-extractor:queryAnalysis

# Run specific queries
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=api-to-domain
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=smart-domain
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=violations
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=impact -Dnode=ENTITY:User
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=unused
```

### Neo4j Tasks

```bash
# Run extractor with Neo4j
./gradlew :tools:knowledge-graph-extractor:run

# Run query runner
./tools/knowledge-graph-extractor/run-queries.sh
```

## Example Cypher Queries (Neo4j)

### Find API-to-Domain flow

```cypher
MATCH (api:JAXRSResource)-[:INJECTS|USES]->(domain:Entity)
MATCH (api)-[:CONTAINS]->(method:Method)-[:CALLS]->(domainMethod:Method)
RETURN api, domain, method, domainMethod
```

### Find Association Implementation Chain

```cypher
MATCH (assocInterface:DomainInterface)
MATCH (assocInterface)<-[:IMPLEMENTS]-(assocImpl:AssociationImplementation)
MATCH (assocImpl)-[:INJECTS]->(mapper:MyBatisMapper)
MATCH (mapper)-[:BINDS_TO]->(xml:XMLMapper)
MATCH (mapper)-[:MAPS_TO]->(table:DatabaseTable)
RETURN assocInterface, assocImpl, mapper, xml, table
```

### Trace Full Request Flow

```cypher
MATCH path = (api:JAXRSResource)-[:CONTAINS]->(apiMethod:Method)
MATCH (apiMethod)-[:CALLS]->(domainMethod:Method)
MATCH (domainMethod)-[:CALLS*]->(infraMethod:Method)
MATCH (infraMethod)-[:MAPS_TO]->(table:DatabaseTable)
RETURN path
```

### Find All Smart Domain Associations

```cypher
MATCH (entity:Entity)-[:CONTAINS]->(assocInterface:DomainInterface)
MATCH (assocInterface)-[:EXTENDS]->(:DomainInterface {type: 'Association'})
MATCH (assocInterface)-[:IMPLEMENTED_BY]->(assocImpl:AssociationImplementation)
MATCH (assocImpl)-[:INJECTS]->(mapper:MyBatisMapper)
MATCH (mapper)-[:BINDS_TO]->(xml:XMLMapper)
RETURN entity, assocInterface, assocImpl, mapper, xml
```

## Output Files (Local Usage)

When using `extractToLocal`, the following files are generated in the `knowledge-graph/` directory:

### Mermaid Files

- **architecture.md** - Architecture view (three-layer structure)
- **api-to-database.md** - API → Database complete flow
- **smart-domain.md** - Smart Domain association patterns
- **full-graph.md** - Complete graph view

### Data Files

- **graph.json** - Complete graph in JSON format
- **nodes.json** - All nodes with properties
- **relationships.json** - All relationships
- **statistics.md** - Graph statistics and summary

### Interactive

- **interactive.html** - Interactive HTML view with multiple tabs

### Query Results (in `queries/` subdirectory)

- **api-to-domain.md** - API to Domain flow query results
- **smart-domain.md** - Smart Domain associations query results
- **architecture-violations.md** - Architecture violations query results
- **unused-entities.md** - Unused entities query results

## Usage Scenarios

### 1. Onboarding New Team Members

```bash
./tools/knowledge-graph-extractor/run-local.sh
```

Open `knowledge-graph/architecture.md` in IntelliJ IDEA to understand the project structure.

### 2. Code Refactoring

```bash
# Analyze impact
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=impact -Dnode=ENTITY:User

# Check for violations
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=violations
```

### 3. Performance Optimization

Open `knowledge-graph/api-to-database.md` to trace database operations and identify N+1 queries.

### 4. Code Review

```bash
# Check for unused code
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=unused

# Check architecture compliance
./gradlew :tools:knowledge-graph-extractor:extractToLocal -Dquery=violations
```

## Comparison: Local vs Neo4j

| Feature           | Local (IntelliJ IDEA)    | Neo4j                         |
| ----------------- | ------------------------ | ----------------------------- |
| Database Required | ❌ No                    | ✅ Neo4j                      |
| Code Navigation   | ✅ Click to jump         | ⚠️ Manual                     |
| Query Language    | ❌ Predefined            | ✅ Cypher                     |
| Performance       | ✅ Fast startup          | ⚠️ Requires Neo4j             |
| Visualization     | ✅ Mermaid charts        | ✅ Neo4j Browser              |
| Deployment        | ✅ Simple                | ⚠️ Requires setup             |
| Best For          | Development, code review | Advanced analysis, production |

## Documentation

- **[LOCAL_USAGE.md](LOCAL_USAGE.md)** - Detailed local usage guide for IntelliJ IDEA
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Implementation details and architecture

## Troubleshooting

### Mermaid Chart Not Displaying

1. Ensure Mermaid plugin is installed in IntelliJ IDEA
2. Restart IntelliJ IDEA
3. Check file format is correct
4. Try closing and reopening Preview pane

### Click Navigation Not Working

1. Ensure node has file path
2. Check path format (should use `file:///`)
3. Mermaid `securityLevel` should be `loose`

### Large Charts Slow to Render

1. Use ELK layout algorithm
2. Split into multiple subgraphs
3. Use `interactive.html` in browser

## Next Steps

- Install Mermaid plugin in IntelliJ IDEA
- Run `./tools/knowledge-graph-extractor/run-local.sh`
- Open `knowledge-graph/architecture.md` in IntelliJ IDEA
- Click Preview to view the architecture
- Click nodes to navigate to source files
