package reengineering.ddd.teamai.mybatis.knowledgegraph;

import java.util.List;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.KnowledgeGraph;
import reengineering.ddd.teamai.model.KnowledgeGraph.Edge;
import reengineering.ddd.teamai.model.KnowledgeGraph.Node;
import reengineering.ddd.teamai.model.KnowledgeGraphReader;
import reengineering.ddd.teamai.mybatis.mappers.KnowledgeGraphMapper;

@Component
public class PostgresKnowledgeGraphReader implements KnowledgeGraphReader {
  private final KnowledgeGraphMapper mapper;

  public PostgresKnowledgeGraphReader(KnowledgeGraphMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public KnowledgeGraph readProjectKnowledgeGraph(String projectId) {
    int parsedProjectId = Integer.parseInt(projectId);
    List<Node> nodes =
        mapper.findNodesByProjectId(parsedProjectId).stream()
            .map(
                row ->
                    new Node(
                        String.valueOf(row.getLogicalEntityId()),
                        row.getLogicalEntityType(),
                        row.getLogicalEntitySubType(),
                        row.getLogicalEntityName(),
                        row.getLogicalEntityLabel(),
                        row.getLogicalEntityDefinition()))
            .toList();
    List<Edge> edges =
        mapper.findEdgesByProjectId(parsedProjectId).stream()
            .map(
                row ->
                    new Edge(
                        String.valueOf(row.getDiagramId()),
                        String.valueOf(row.getSourceLogicalEntityId()),
                        String.valueOf(row.getTargetLogicalEntityId()),
                        row.getRelationType()))
            .toList();
    return new KnowledgeGraph(projectId, nodes, edges);
  }
}
