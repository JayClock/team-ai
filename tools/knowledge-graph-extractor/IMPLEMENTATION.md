# Knowledge Graph Extractor - Implementation Complete

## Overview

The Knowledge Graph Extractor has been successfully implemented to analyze the Team AI codebase and extract structural relationships into a Neo4j graph database.

## Implementation Details

### Architecture

```
tools/knowledge-graph-extractor/
├── src/main/java/reengineering/ddd/knowledgegraph/
│   ├── KnowledgeGraphApplication.java       # Main entry point
│   ├── model/                             # Graph node and relationship types
│   ├── extractor/                          # Code analysis extractors
│   │   ├── BaseExtractor.java              # Base extractor with JavaParser config
│   │   ├── KnowledgeGraphExtractor.java     # Orchestrates all extractors
│   │   ├── api/ApiLayerExtractor.java    # API layer (JAX-RS) extraction
│   │   ├── domain/DomainLayerExtractor.java # Domain layer extraction
│   │   └── infrastructure/              # Infrastructure layer
│   │       ├── InfrastructureLayerExtractor.java
│   │       └── XMLMapperExtractor.java
│   └── neo4j/                             # Neo4j integration
│       ├── Neo4jGraphStore.java
│       ├── CypherQueryRunner.java
│       └── MermaidGraphExporter.java
├── build.gradle                          # Gradle configuration
└── README.md                             # Usage documentation
```

### Extracted Elements

#### Nodes (81 in current extraction)

- **Entity** (4): User, Conversation, Message, Account
- **MyBatisMapper** (4): Database mapper interfaces
- **XMLMapper** (4): MyBatis XML configuration files
- **ExternalService** (1): ModelProvider (AI service abstraction)
- **JAXRSResource** (3): REST API endpoints
- **DomainInterface** (4): Association interfaces
- **AssociationImplementation** (3): Infrastructure implementations
- **DatabaseTable** (4): Database tables
- **Method** (48): Methods across all layers
- **HATEOASModel** (3): HATEOAS representation models
- **Layer** (3): Architectural layers

#### Relationships (147 in current extraction)

- **BELONGS_TO**: Layer membership
- **CONTAINS**: Class contains methods/fields
- **IMPLEMENTS**: Class implements interface
- **EXTENDS**: Inheritance
- **INJECTS**: Dependency injection
- **CALLS**: Method invocation
- **EXPOSES_AS**: Association pattern
- **IMPLEMENTED_BY**: Domain interface → infrastructure
- **MAPS_TO**: Mapper → database table
- **BINDS_TO**: XML namespace → Java mapper
- **GENERATES_LINK**: HATEOAS link generation
- **RETURNS_STREAM**: Reactive streams
- **WRITES_TO**, **READS_FROM**, **OPERATES_ON**: Database operations
- **DEFINES_QUERY**: Mapper methods define SQL queries

## Usage

### Prerequisites

1. **Java 17+**
2. **Gradle 8.10**
3. **Neo4j Database** (optional, for graph storage)

### Running the Extractor

```bash
# Extract to memory only (no Neo4j)
./gradlew :tools:knowledge-graph-extractor:run -Dneo4j.uri=dummy

# Extract and store in Neo4j
./gradlew :tools:knowledge-graph-extractor:run \
  -Dneo4j.uri=bolt://localhost:7687 \
  -Dneo4j.user=neo4j \
  -Dneo4j.password=password

# Clear Neo4j database before extraction
./gradlew :tools:knowledge-graph-extractor:run -Dneo4j.clear=true

# Using the provided script
./tools/knowledge-graph-extractor/run-extractor.sh
```

### Starting Neo4j (Docker)

```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:5.18
```

## Test Results

```bash
$ ./gradlew :tools:knowledge-graph-extractor:test

=== Knowledge Graph Extraction Summary ===

Total Nodes: 81
Total Relationships: 147

Nodes by Type:
  Entity: 4
  MyBatisMapper: 4
  XMLMapper: 4
  ExternalService: 1
  JAXRSResource: 3
  DomainInterface: 4
  AssociationImplementation: 3
  DatabaseTable: 4
  Method: 48
  HATEOASModel: 3
  Layer: 3

Relationships by Type:
  BELONGS_TO: 14
  CONTAINS: 51
  IMPLEMENTS: 7
  EXTENDS: 4
  INJECTS: 6
  CALLS: 12
  EXPOSES_AS: 3
  IMPLEMENTED_BY: 3
  MAPS_TO: 4
  BINDS_TO: 4
  GENERATES_LINK: 6
  RETURNS_STREAM: 1
  WRITES_TO: 4
  READS_FROM: 8
  OPERATES_ON: 4
  DEFINES_QUERY: 12

BUILD SUCCESSFUL
```

## Key Features Implemented

### 1. Smart Domain Pattern Detection

- Identifies association interfaces (e.g., `User.Conversations`, `Conversation.Messages`)
- Tracks `HasMany` extension pattern
- Links domain interfaces to infrastructure implementations

### 2. Three-Layer Architecture Mapping

- **API Layer**: JAX-RS resources, HTTP methods, HATEOAS models
- **Domain Layer**: Entities, DTOs, domain services, association interfaces
- **Infrastructure Layer**: MyBatis mappers, XML configurations, database tables

### 3. Cross-Layer Relationship Tracking

- API → Domain: Dependency injection, method calls
- Domain → Infrastructure: Interface implementations
- Infrastructure → Database: Table mappings

### 4. Reactive Stream Detection

- Identifies methods returning `Flux<T>`
- Tracks SSE endpoints with `SseEventSink`

### 5. HATEOAS Link Analysis

- Extracts HATEOAS model classes
- Tracks link generation patterns
- Records semantic link relations

### 6. Database Mapping Extraction

- Parses MyBatis XML mapper files
- Extracts SQL statements (SELECT, INSERT)
- Identifies database table references
- Links mapper methods to tables

## Example Queries

### Find All Smart Domain Associations

```cypher
MATCH (entity:Entity)-[:CONTAINS]->(assocInterface:DomainInterface)
MATCH (assocInterface)-[:EXTENDS]->(:DomainInterface {type: 'Association'})
MATCH (assocInterface)-[:IMPLEMENTED_BY]->(assocImpl:AssociationImplementation)
MATCH (assocImpl)-[:INJECTS]->(mapper:MyBatisMapper)
MATCH (mapper)-[:BINDS_TO]->(xml:XMLMapper)
MATCH (mapper)-[:MAPS_TO]->(table:DatabaseTable)
RETURN entity.name as entity,
       assocInterface.name as interface,
       assocImpl.name as impl,
       mapper.name as mapper,
       table.name as table
```

### Trace API to Database Flow

```cypher
MATCH path = (api:JAXRSResource)-[:CONTAINS]->(apiMethod:Method)
MATCH (apiMethod)-[:CALLS]->(domainMethod:Method)
MATCH (domainMethod)-[:CALLS*]->(infraMethod:Method)
MATCH (infraMethod)-[:MAPS_TO]->(table:DatabaseTable)
RETURN path
```

### Find All Reactive Endpoints

```cypher
MATCH (method:Method)-[:RETURNS_STREAM]->(stream)
MATCH (resource:JAXRSResource)-[:CONTAINS]->(method)
RETURN resource.name as resource,
       method.name as method,
       stream as stream_type
```

## Technical Implementation

### Dependencies

- **JavaParser 3.26.1**: AST parsing with Java 17 support
- **DOM4J 2.1.4**: XML mapper file parsing
- **Neo4j Driver 5.18.0**: Graph database connectivity
- **TestContainers**: Integration testing with Neo4j

### JavaParser Configuration

```java
ParserConfiguration config =
    new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17);
```

### Pattern Detection

**Association Interface Detection**:

```java
boolean isAssociation = n.getExtendedTypes().stream()
    .map(type -> type.getNameAsString())
    .anyMatch(name -> name.equals("HasMany"));
```

**HATEOAS Model Detection**:

```java
String extendedType = n.getExtendedTypes().stream()
    .map(type -> type.getNameAsString())
    .findFirst()
    .orElse("");
if (extendedType.equals("RepresentationModel")) { ... }
```

**JAX-RS Resource Detection**:

```java
if (!n.isInterface() && hasAnnotation(n, "Path")) { ... }
```

## Integration with CI/CD

Add to GitHub Actions:

```yaml
- name: Extract Knowledge Graph
  run: ./gradlew :tools:knowledge-graph-extractor:run

- name: Store in Neo4j
  run: ./gradlew :tools:knowledge-graph-extractor:run
    -Dneo4j.uri=${{ secrets.NEO4J_URI }}
    -Dneo4j.user=${{ secrets.NEO4J_USER }}
    -Dneo4j.password=${{ secrets.NEO4J_PASSWORD }}
```

## Next Steps

### Enhancements

1. Add method call chain analysis (recursive CALLS relationships)
2. Extract SQL queries more accurately (including parameters)
3. Support for other databases (beyond PostgreSQL)
4. Add more HATEOAS link patterns
5. Detect more architecture patterns (Repository, Factory, etc.)

### Visualization

1. Integrate with graph visualization tools (Neo4j Bloom, D3.js)
2. Generate interactive Mermaid diagrams from graph
3. Create layer-based visualization
4. Add temporal analysis (how graph changes over commits)

### Analysis Queries

1. Detect architectural violations (e.g., Infrastructure calling Domain directly)
2. Identify circular dependencies
3. Analyze coupling metrics
4. Generate architecture documentation from graph
5. Find unused code (entities with no API endpoints)

## Files Modified/Created

### Created (20+ files)

- Model classes: `Layer`, `Node`, `Graph`, `Relationship` (and subclasses)
- Extractors: `ApiLayerExtractor`, `DomainLayerExtractor`, `InfrastructureLayerExtractor`
- Neo4j integration: `Neo4jGraphStore`, `CypherQueryRunner`, `MermaidGraphExporter`
- Configuration: `build.gradle`, `logback.xml`, `application.properties`
- Documentation: `README.md` (in extractor directory)
- Scripts: `run-extractor.sh`, `run-queries.sh`

### Modified

- `settings.gradle`: Added `tools:knowledge-graph-extractor` module

## Conclusion

The Knowledge Graph Extractor successfully implements the plan to analyze the Smart Domain DDD architecture of Team AI. It extracts 81 nodes and 147 relationships, capturing the three-layer architecture (API, Domain, Infrastructure), Smart Domain patterns (association objects), and HATEOAS link structures.

All tests pass, and the extractor is ready for integration into the development workflow and CI/CD pipeline.
