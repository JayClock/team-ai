package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.mybatis.knowledgegraph.KnowledgeGraphEdgeRow;
import reengineering.ddd.teamai.mybatis.knowledgegraph.KnowledgeGraphNodeRow;

@Mapper
public interface KnowledgeGraphMapper {
  void deleteEdgesByProjectAndDiagram(
      @Param("project_id") int projectId, @Param("diagram_id") int diagramId);

  void upsertNode(
      @Param("project_id") int projectId,
      @Param("logical_entity_id") int logicalEntityId,
      @Param("logical_entity_type") String logicalEntityType,
      @Param("logical_entity_sub_type") String logicalEntitySubType,
      @Param("logical_entity_name") String logicalEntityName,
      @Param("logical_entity_label") String logicalEntityLabel,
      @Param("logical_entity_definition") String logicalEntityDefinition);

  void upsertEdge(
      @Param("project_id") int projectId,
      @Param("diagram_id") int diagramId,
      @Param("source_node_id") Integer sourceNodeId,
      @Param("target_node_id") Integer targetNodeId,
      @Param("source_logical_entity_id") int sourceLogicalEntityId,
      @Param("target_logical_entity_id") int targetLogicalEntityId,
      @Param("relation_type") String relationType);

  void upsertEmbedding(
      @Param("project_id") int projectId,
      @Param("logical_entity_id") int logicalEntityId,
      @Param("source_text") String sourceText,
      @Param("embedding_literal") String embeddingLiteral);

  List<KnowledgeGraphNodeRow> findNodesByProjectId(@Param("project_id") int projectId);

  List<KnowledgeGraphEdgeRow> findEdgesByProjectId(@Param("project_id") int projectId);
}
