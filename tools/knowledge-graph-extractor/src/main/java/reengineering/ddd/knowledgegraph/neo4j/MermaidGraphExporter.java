package reengineering.ddd.knowledgegraph.neo4j;

import org.neo4j.driver.*;
import org.neo4j.driver.Record;
import org.neo4j.driver.types.Node;

public class MermaidGraphExporter {
  private final Driver driver;

  public MermaidGraphExporter(String uri, String username, String password) {
    this.driver = GraphDatabase.driver(uri, AuthTokens.basic(username, password));
  }

  public String exportGraph() {
    StringBuilder mermaid = new StringBuilder();
    mermaid.append("graph TD\n");

    try (Session session = driver.session()) {
      Result nodesResult =
          session.run(
              """
                    MATCH (n)
                    RETURN n.id as id, n.type as type, n.name as name
                    ORDER BY type, name
                    """);

      mermaid.append("  %% Nodes\n");
      while (nodesResult.hasNext()) {
        Record record = nodesResult.next();
        String id = record.get("id").asString().replace(":", "_");
        String type = record.get("type").asString();
        String name = record.get("name").asString();
        mermaid.append(String.format("  %s[\"%s\\n(%s)\"]\n", id, name, type));
      }

      mermaid.append("\n  %% Relationships\n");
      Result relsResult =
          session.run(
              """
                    MATCH (source)-[r]->(target)
                    RETURN source.id as source, target.id as target, type(r) as rel
                    LIMIT 100
                    """);

      while (relsResult.hasNext()) {
        Record record = relsResult.next();
        String source = record.get("source").asString().replace(":", "_");
        String target = record.get("target").asString().replace(":", "_");
        String rel = record.get("rel").asString();
        mermaid.append(String.format("  %s -->|%s| %s\n", source, rel, target));
      }
    }

    return mermaid.toString();
  }

  public String exportSubgraph(String query) {
    StringBuilder mermaid = new StringBuilder();
    mermaid.append("graph TD\n");

    try (Session session = driver.session()) {
      Result result = session.run(query);

      mermaid.append("  %% Nodes\n");
      while (result.hasNext()) {
        Record record = result.next();
        if (record.containsKey("node")) {
          Node node = record.get("node").asNode();
          String id = node.get("id").asString().replace(":", "_");
          String type = node.get("type").asString();
          String name = node.get("name").asString();
          mermaid.append(String.format("  %s[\"%s\\n(%s)\"]\n", id, name, type));
        }
      }
    }

    return mermaid.toString();
  }

  public void close() {
    if (driver != null) {
      driver.close();
    }
  }
}
