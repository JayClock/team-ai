package reengineering.ddd.teamai.mybatis.knowledgegraph;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.mybatis.mappers.KnowledgeGraphJobsMapper;
import reengineering.ddd.teamai.mybatis.mappers.KnowledgeGraphMapper;
import reengineering.ddd.teamai.mybatis.mappers.ProjectDiagramsMapper;
import reengineering.ddd.teamai.service.SemanticRelationInferService;

@Component
public class KnowledgeGraphPublishWorker {
  private final KnowledgeGraphJobsMapper jobsMapper;
  private final KnowledgeGraphMapper graphMapper;
  private final ProjectDiagramsMapper projectDiagramsMapper;
  private final SemanticRelationInferService relationInferService;

  @Value("${teamai.knowledge-graph.publish.batch-size:20}")
  private int batchSize;

  @Value("${teamai.knowledge-graph.publish.max-retries:3}")
  private int maxRetries;

  @Value("${teamai.knowledge-graph.publish.retry-seconds:30}")
  private int retrySeconds;

  public KnowledgeGraphPublishWorker(
      KnowledgeGraphJobsMapper jobsMapper,
      KnowledgeGraphMapper graphMapper,
      ProjectDiagramsMapper projectDiagramsMapper,
      SemanticRelationInferService relationInferService) {
    this.jobsMapper = jobsMapper;
    this.graphMapper = graphMapper;
    this.projectDiagramsMapper = projectDiagramsMapper;
    this.relationInferService = relationInferService;
  }

  @Scheduled(fixedDelayString = "${teamai.knowledge-graph.publish.fixed-delay-ms:2500}")
  public void processPendingJobs() {
    List<KnowledgeGraphJobRow> jobs = jobsMapper.claimPendingJobs(batchSize);
    for (KnowledgeGraphJobRow job : jobs) {
      processJob(job);
    }
  }

  private void processJob(KnowledgeGraphJobRow job) {
    try {
      rebuildGraph(job.getProjectId(), job.getDiagramId());
      jobsMapper.markSucceeded(job.getId());
    } catch (Exception error) {
      String message = shortenError(error);
      if (job.getAttemptCount() + 1 >= maxRetries) {
        jobsMapper.markFailed(job.getId(), message);
      } else {
        jobsMapper.requeue(job.getId(), message, retrySeconds);
      }
    }
  }

  private void rebuildGraph(int projectId, int diagramId) {
    graphMapper.deleteEdgesByProjectAndDiagram(projectId, diagramId);
    Diagram diagram = projectDiagramsMapper.findDiagramByProjectAndId(projectId, diagramId);
    if (diagram == null) {
      return;
    }

    Map<String, DiagramNode> nodeById = new LinkedHashMap<>();
    for (DiagramNode node : diagram.nodes().findAll()) {
      nodeById.put(node.getIdentity(), node);
      upsertNodeAndEmbedding(projectId, node);
    }
    for (DiagramEdge edge : diagram.edges().findAll()) {
      if (edge == null || Boolean.TRUE.equals(edge.getDescription().hidden())) {
        continue;
      }
      upsertSemanticEdge(projectId, diagramId, edge, nodeById);
    }
  }

  private void upsertNodeAndEmbedding(int projectId, DiagramNode node) {
    LogicalEntity logicalEntity = node.logicalEntity();
    if (logicalEntity == null) {
      return;
    }
    Integer logicalEntityId = toIntOrNull(logicalEntity.getIdentity());
    if (logicalEntityId == null) {
      return;
    }
    String subType =
        logicalEntity.getDescription().subType() == null
            ? null
            : logicalEntity.getDescription().subType().getValue();
    String definition = toDefinitionJson(logicalEntity);
    graphMapper.upsertNode(
        projectId,
        logicalEntityId,
        logicalEntity.getDescription().type().name(),
        subType,
        logicalEntity.getDescription().name(),
        logicalEntity.getDescription().label(),
        definition);

    String sourceText = buildSourceText(logicalEntity);
    String literal =
        DeterministicEmbeddingEncoder.toPgArrayLiteral(
            DeterministicEmbeddingEncoder.encode(sourceText));
    graphMapper.upsertEmbedding(projectId, logicalEntityId, sourceText, literal);
  }

  private void upsertSemanticEdge(
      int projectId, int diagramId, DiagramEdge edge, Map<String, DiagramNode> nodeById) {
    String sourceNodeId =
        edge.getDescription().sourceNode() == null ? null : edge.getDescription().sourceNode().id();
    String targetNodeId =
        edge.getDescription().targetNode() == null ? null : edge.getDescription().targetNode().id();
    if (sourceNodeId == null || targetNodeId == null) {
      return;
    }
    DiagramNode sourceNode = nodeById.get(sourceNodeId);
    DiagramNode targetNode = nodeById.get(targetNodeId);
    if (sourceNode == null || targetNode == null) {
      return;
    }
    LogicalEntity sourceEntity = sourceNode.logicalEntity();
    LogicalEntity targetEntity = targetNode.logicalEntity();
    if (sourceEntity == null || targetEntity == null) {
      return;
    }
    Integer sourceLogicalEntityId = toIntOrNull(sourceEntity.getIdentity());
    Integer targetLogicalEntityId = toIntOrNull(targetEntity.getIdentity());
    if (sourceLogicalEntityId == null || targetLogicalEntityId == null) {
      return;
    }

    String relationType = edge.getDescription().relationType();
    if (relationType == null || relationType.isBlank()) {
      relationType = relationInferService.inferRelationType(sourceNode, targetNode);
    }

    graphMapper.upsertEdge(
        projectId,
        diagramId,
        toIntOrNull(sourceNodeId),
        toIntOrNull(targetNodeId),
        sourceLogicalEntityId,
        targetLogicalEntityId,
        relationType);
  }

  private static Integer toIntOrNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    try {
      return Integer.parseInt(value);
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private static String buildSourceText(LogicalEntity entity) {
    String subType =
        entity.getDescription().subType() == null
            ? ""
            : entity.getDescription().subType().getValue();
    String description =
        entity.getDescription().definition() == null
            ? null
            : entity.getDescription().definition().description();
    return String.join(
            " ",
            entity.getDescription().type().name(),
            subType,
            entity.getDescription().name(),
            entity.getDescription().label() == null ? "" : entity.getDescription().label(),
            description == null ? "" : description)
        .trim();
  }

  private static String toDefinitionJson(LogicalEntity entity) {
    if (entity.getDescription().definition() == null
        || entity.getDescription().definition().description() == null
        || entity.getDescription().definition().description().isBlank()) {
      return "{}";
    }
    String escaped =
        entity
            .getDescription()
            .definition()
            .description()
            .replace("\\", "\\\\")
            .replace("\"", "\\\"");
    return "{\"description\":\"" + escaped + "\"}";
  }

  private static String shortenError(Exception error) {
    String message = error.getMessage();
    if (message == null || message.isBlank()) {
      return error.getClass().getSimpleName();
    }
    return message.length() > 600 ? message.substring(0, 600) : message;
  }
}
