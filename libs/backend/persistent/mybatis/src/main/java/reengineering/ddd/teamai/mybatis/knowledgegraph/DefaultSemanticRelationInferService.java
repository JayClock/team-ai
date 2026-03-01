package reengineering.ddd.teamai.mybatis.knowledgegraph;

import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.service.SemanticRelationInferService;

@Component
public class DefaultSemanticRelationInferService implements SemanticRelationInferService {
  @Override
  public String inferRelationType(DiagramNode source, DiagramNode target) {
    LogicalEntity sourceEntity = source == null ? null : source.logicalEntity();
    LogicalEntity targetEntity = target == null ? null : target.logicalEntity();
    if (sourceEntity == null || targetEntity == null) {
      return "RELATES_TO";
    }

    LogicalEntityDescription sourceDescription = sourceEntity.getDescription();
    LogicalEntityDescription targetDescription = targetEntity.getDescription();
    String sourceType = sourceDescription.type().name();
    String targetType = targetDescription.type().name();
    String sourceSubType =
        sourceDescription.subType() == null ? null : sourceDescription.subType().getValue();
    String targetSubType =
        targetDescription.subType() == null ? null : targetDescription.subType().getValue();

    if ("PARTICIPANT".equals(sourceType) && "ROLE".equals(targetType)) {
      return "PLAYS";
    }
    if ("ROLE".equals(sourceType) && "EVIDENCE".equals(targetType)) {
      return "PARTICIPATES_IN";
    }
    if ("EVIDENCE".equals(sourceType) && "EVIDENCE".equals(targetType)) {
      return inferEvidenceRelation(sourceSubType, targetSubType);
    }
    if ("EVIDENCE".equals(sourceType)
        && "ROLE".equals(targetType)
        && "fulfillment_confirmation".equals(sourceSubType)
        && "evidence_role".equals(targetSubType)) {
      return "BRIDGES_TO";
    }
    if ("ROLE".equals(sourceType)
        && "EVIDENCE".equals(targetType)
        && "evidence_role".equals(sourceSubType)
        && "fulfillment_confirmation".equals(targetSubType)) {
      return "BRIDGES_TO";
    }
    return "RELATES_TO";
  }

  private static String inferEvidenceRelation(String sourceSubType, String targetSubType) {
    if ("rfp".equals(sourceSubType) && "proposal".equals(targetSubType)) {
      return "PRECEDES";
    }
    if ("proposal".equals(sourceSubType) && "contract".equals(targetSubType)) {
      return "PRECEDES";
    }
    if ("contract".equals(sourceSubType) && "fulfillment_request".equals(targetSubType)) {
      return "AUTHORIZES";
    }
    if ("fulfillment_request".equals(sourceSubType)
        && "fulfillment_confirmation".equals(targetSubType)) {
      return "FULFILLS";
    }
    return "RELATES_TO";
  }
}
