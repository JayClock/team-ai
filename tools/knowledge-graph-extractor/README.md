# Knowledge Graph Extractor

Extracts code structure and dependencies from the Team AI codebase and builds a knowledge graph stored in Neo4j.

## Usage

### Running the Extractor

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

## Example Cypher Queries

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
