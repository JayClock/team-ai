package reengineering.ddd.knowledgegraph.neo4j;

import java.util.Map;
import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Driver;
import org.neo4j.driver.GraphDatabase;
import org.neo4j.driver.Result;
import org.neo4j.driver.Session;
import reengineering.ddd.knowledgegraph.model.Graph;
import reengineering.ddd.knowledgegraph.model.Node;
import reengineering.ddd.knowledgegraph.model.Relationship;

public class Neo4jGraphStore implements AutoCloseable {
  private final Driver driver;
  private final String database;

  public Neo4jGraphStore(String uri, String username, String password) {
    this(uri, username, password, "neo4j");
  }

  public Neo4jGraphStore(String uri, String username, String password, String database) {
    this.driver = GraphDatabase.driver(uri, AuthTokens.basic(username, password));
    this.database = database;
  }

  public void storeGraph(Graph graph) {
    try (Session session = driver.session()) {
      session.writeTransaction(
          tx -> {
            for (Node node : graph.getNodes()) {
              createNode(tx, node);
            }

            for (Relationship relationship : graph.getRelationships()) {
              createRelationship(tx, relationship);
            }

            return null;
          });
    }
  }

  private void createNode(org.neo4j.driver.Transaction tx, Node node) {
    String query = String.format("MERGE (n:%s {id: $id}) " + "SET n = $properties", node.getType());

    Map<String, Object> properties = new java.util.HashMap<>(node.getProperties());
    properties.put("id", node.getId());

    tx.run(query, properties);
  }

  private void createRelationship(org.neo4j.driver.Transaction tx, Relationship relationship) {
    String labelQuery =
        relationship.getLabel() != null
            ? String.format("{label: '%s'}", relationship.getLabel())
            : "";

    String query =
        String.format(
            "MATCH (source {id: $sourceId}) "
                + "MATCH (target {id: $targetId}) "
                + "MERGE (source)-[r:%s]->(target) "
                + "SET r += %s",
            relationship.getType().name(), labelQuery);

    tx.run(
        query,
        Map.of(
            "sourceId", relationship.getSourceId(),
            "targetId", relationship.getTargetId()));
  }

  public Result executeQuery(String query, Map<String, Object> parameters) {
    try (Session session = driver.session()) {
      return session.run(query, parameters);
    }
  }

  public void clearDatabase() {
    try (Session session = driver.session()) {
      session.run("MATCH (n) DETACH DELETE n");
    }
  }

  @Override
  public void close() {
    if (driver != null) {
      driver.close();
    }
  }
}
