package reengineering.ddd.teamai.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Project;

@Component
public class DiagramCommitDraftMapper {
  private final ObjectMapper objectMapper;

  public DiagramCommitDraftMapper(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  DraftPayload map(DiagramApi.CommitDraftRequest request) {
    List<Project.Diagrams.DraftNode> draftNodes = new ArrayList<>(request.safeNodes().size());
    for (DiagramApi.CommitDraftNodeSchema nodeRequest : request.safeNodes()) {
      draftNodes.add(toDraftNode(nodeRequest));
    }

    List<Project.Diagrams.DraftEdge> draftEdges = new ArrayList<>(request.safeEdges().size());
    for (DiagramApi.CommitDraftEdgeSchema edgeRequest : request.safeEdges()) {
      draftEdges.add(toDraftEdge(edgeRequest));
    }
    return new DraftPayload(draftNodes, draftEdges);
  }

  private Project.Diagrams.DraftNode toDraftNode(DiagramApi.CommitDraftNodeSchema nodeRequest) {
    NodeDescription description =
        new NodeDescription(
            nodeRequest.getType(),
            nodeRequest.getLogicalEntity(),
            nodeRequest.getParent(),
            nodeRequest.getPositionX(),
            nodeRequest.getPositionY(),
            nodeRequest.getWidth(),
            nodeRequest.getHeight(),
            null,
            toJsonBlob(nodeRequest.getLocalData()));
    return new Project.Diagrams.DraftNode(nodeRequest.getId(), description);
  }

  private Project.Diagrams.DraftEdge toDraftEdge(DiagramApi.CommitDraftEdgeSchema edgeRequest) {
    return new Project.Diagrams.DraftEdge(
        extractNodeId(edgeRequest.getSourceNode()),
        extractNodeId(edgeRequest.getTargetNode()),
        edgeRequest.getHidden());
  }

  private String extractNodeId(Ref<String> nodeRef) {
    return nodeRef == null ? null : nodeRef.id();
  }

  private JsonBlob toJsonBlob(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return new JsonBlob(objectMapper.writeValueAsString(value));
    } catch (JsonProcessingException error) {
      throw badRequest("Node localData must be valid JSON.");
    }
  }

  private static RuntimeException badRequest(String message) {
    return new jakarta.ws.rs.BadRequestException(message);
  }

  record DraftPayload(
      List<Project.Diagrams.DraftNode> nodes, List<Project.Diagrams.DraftEdge> edges) {}
}
