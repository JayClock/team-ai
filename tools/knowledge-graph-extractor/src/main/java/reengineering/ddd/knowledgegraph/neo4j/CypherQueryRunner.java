package reengineering.ddd.knowledgegraph.neo4j;

import java.util.Map;
import org.neo4j.driver.*;
import org.neo4j.driver.Record;

public class CypherQueryRunner {
  private final Driver driver;

  public CypherQueryRunner(String uri, String username, String password) {
    this.driver = GraphDatabase.driver(uri, AuthTokens.basic(username, password));
  }

  public void runQuery(String query) {
    try (Session session = driver.session()) {
      Result result = session.run(query);
      while (result.hasNext()) {
        Record record = result.next();
        System.out.println(record.toString());
      }
    }
  }

  public void runQuery(String query, Map<String, Object> parameters) {
    try (Session session = driver.session()) {
      Result result = session.run(query, parameters);
      while (result.hasNext()) {
        Record record = result.next();
        System.out.println(record.toString());
      }
    }
  }

  public void findApiToDomainFlow() {
    String query =
        """
                MATCH (api:JAXRSResource)-[:INJECTS|USES]->(domain:Entity)
                MATCH (api)-[:CONTAINS]->(method:Method)-[:CALLS]->(domainMethod:Method)
                RETURN api, domain, method, domainMethod
                """;

    System.out.println("=== API to Domain Flow ===");
    runQuery(query);
  }

  public void findAssociationChains() {
    String query =
        """
                MATCH (assocInterface:DomainInterface {type: 'Association'})
                MATCH (assocInterface)<-[:IMPLEMENTS]-(assocImpl:AssociationImplementation)
                MATCH (assocImpl)-[:INJECTS]->(mapper:MyBatisMapper)
                MATCH (mapper)-[:BINDS_TO]->(xml:XMLMapper)
                MATCH (mapper)-[:MAPS_TO]->(table:DatabaseTable)
                RETURN assocInterface.name as interface, assocImpl.name as impl, mapper.name as mapper, table.name as table
                """;

    System.out.println("=== Association Implementation Chains ===");
    runQuery(query);
  }

  public void findSmartDomainPatterns() {
    String query =
        """
                MATCH (entity:Entity)-[:CONTAINS]->(assocInterface:DomainInterface)
                MATCH (assocInterface)-[:EXTENDS]->(:DomainInterface {type: 'Association'})
                MATCH (assocInterface)-[:IMPLEMENTED_BY]->(assocImpl:AssociationImplementation)
                MATCH (assocImpl)-[:INJECTS]->(mapper:MyBatisMapper)
                MATCH (mapper)-[:BINDS_TO]->(xml:XMLMapper)
                RETURN entity.name as entity, assocInterface.name as interface, assocImpl.name as impl
                """;

    System.out.println("=== Smart Domain Association Patterns ===");
    runQuery(query);
  }

  public void printGraphStatistics() {
    String nodeQuery = "MATCH (n) RETURN n.type as type, count(n) as count ORDER BY type";
    String relQuery = "MATCH ()-[r]->() RETURN type(r) as type, count(r) as count ORDER BY type";

    System.out.println("=== Node Statistics ===");
    runQuery(nodeQuery);

    System.out.println("\n=== Relationship Statistics ===");
    runQuery(relQuery);
  }

  public void close() {
    if (driver != null) {
      driver.close();
    }
  }
}
