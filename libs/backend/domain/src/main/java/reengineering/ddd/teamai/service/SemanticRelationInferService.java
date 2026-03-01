package reengineering.ddd.teamai.service;

import reengineering.ddd.teamai.model.DiagramNode;

public interface SemanticRelationInferService {
  String inferRelationType(DiagramNode source, DiagramNode target);
}
