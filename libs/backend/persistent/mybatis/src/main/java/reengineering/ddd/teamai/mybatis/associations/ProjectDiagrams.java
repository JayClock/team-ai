package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Diagram.Status;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectDiagramsMapper;
import reengineering.ddd.teamai.mybatis.support.AssociationTransactionDecorator;

@AssociationMapping(entity = Project.class, field = "diagrams", parentIdField = "projectId")
public class ProjectDiagrams extends EntityList<String, Diagram> implements Project.Diagrams {

  private static final String CACHE_NAME = "projectDiagrams";
  private static final String CACHE_LIST = "projectDiagramsList";
  private static final String CACHE_COUNT = "projectDiagramsCount";

  private int projectId;

  @Inject private ProjectDiagramsMapper mapper;
  @Inject private AssociationTransactionDecorator transactionDecorator;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<Diagram> findEntities(int from, int to) {
    return mapper.findDiagramsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected Diagram findEntity(String id) {
    return mapper.findDiagramByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countDiagramsByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId")
      })
  public Diagram add(DiagramDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertDiagram(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  public void saveDiagram(
      String diagramId,
      Collection<Project.Diagrams.DraftNode> draftNodes,
      Collection<Project.Diagrams.DraftEdge> draftEdges) {
    transactionDecorator.execute(
        () -> {
          doCommitDraft(diagramId, draftNodes, draftEdges);
          return null;
        });
  }

  @Override
  public void publishDiagram(String diagramId) {
    if (diagramId == null || diagramId.isBlank()) {
      throw new Project.Diagrams.InvalidDraftException("Diagram id must be provided.");
    }
    int parsedDiagramId = Integer.parseInt(diagramId);
    Diagram diagram =
        findByIdentity(diagramId)
            .orElseThrow(
                () ->
                    new Project.Diagrams.InvalidDraftException("Diagram not found: " + diagramId));

    if (!(diagram.nodes() instanceof DiagramNodes diagramNodes)) {
      throw new IllegalStateException("Diagram nodes association must be DiagramNodes.");
    }

    transactionDecorator.execute(
        () -> {
          diagramNodes.promoteNodeLocalDataToLogicalEntitiesForPublish(projectId);
          mapper.updateDiagramStatus(projectId, parsedDiagramId, Status.PUBLISHED);
          return null;
        });
  }

  private void doCommitDraft(
      String diagramId,
      Collection<Project.Diagrams.DraftNode> draftNodes,
      Collection<Project.Diagrams.DraftEdge> draftEdges) {
    validateDiagramId(diagramId);
    Diagram diagram = findDiagramOrThrow(diagramId);

    if (!(diagram.nodes() instanceof DiagramNodes diagramNodes)) {
      throw new IllegalStateException("Diagram nodes association must be DiagramNodes.");
    }
    if (!(diagram.edges() instanceof DiagramEdges diagramEdges)) {
      throw new IllegalStateException("Diagram edges association must be DiagramEdges.");
    }

    Map<String, String> createdNodeIdByRef = diagramNodes.commitDraftNodes(draftNodes);
    diagramEdges.commitDraftEdges(draftEdges, createdNodeIdByRef);
    updateDraftStatus(diagramId);
  }

  private static void validateDiagramId(String diagramId) {
    if (diagramId == null || diagramId.isBlank()) {
      throw new Project.Diagrams.InvalidDraftException("Diagram id must be provided.");
    }
  }

  private Diagram findDiagramOrThrow(String diagramId) {
    return findByIdentity(diagramId)
        .orElseThrow(
            () -> new Project.Diagrams.InvalidDraftException("Diagram not found: " + diagramId));
  }

  private void updateDraftStatus(String diagramId) {
    mapper.updateDiagramStatus(projectId, Integer.parseInt(diagramId), Status.DRAFT);
  }
}
