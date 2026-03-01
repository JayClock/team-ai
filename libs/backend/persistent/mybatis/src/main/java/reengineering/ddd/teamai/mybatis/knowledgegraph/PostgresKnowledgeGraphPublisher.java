package reengineering.ddd.teamai.mybatis.knowledgegraph;

import java.time.Instant;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Project.KnowledgeGraphPublishRequest;
import reengineering.ddd.teamai.mybatis.mappers.KnowledgeGraphJobsMapper;

@Component
public class PostgresKnowledgeGraphPublisher implements Project.KnowledgeGraphPublisher {
  private final KnowledgeGraphJobsMapper mapper;

  public PostgresKnowledgeGraphPublisher(KnowledgeGraphJobsMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public void publish(KnowledgeGraphPublishRequest request) {
    int projectId = parseIdentifier(request.projectId(), "projectId");
    int diagramId = parseIdentifier(request.diagramId(), "diagramId");
    Instant requestedAt = request.publishedAt() == null ? Instant.now() : request.publishedAt();
    mapper.upsertPublishJob(projectId, diagramId, requestedAt);
  }

  private static int parseIdentifier(String value, String name) {
    try {
      return Integer.parseInt(value);
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException(name + " must be a numeric id: " + value, error);
    }
  }
}
