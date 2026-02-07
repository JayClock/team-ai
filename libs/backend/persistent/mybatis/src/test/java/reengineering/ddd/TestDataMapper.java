package reengineering.ddd;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.description.LogicalEntityDescription;

@Mapper
public interface TestDataMapper {
  @Insert("INSERT INTO users(id, name, email) VALUES(#{id}, #{name}, #{email})")
  void insertUser(@Param("id") int id, @Param("name") String name, @Param("email") String email);

  @Insert(
      "INSERT INTO accounts(ID,PROVIDER,PROVIDER_ID,USER_ID) VALUES ( #{id} ,#{provider} ,#{provider_id} ,#{user_id}  )")
  void insertAccount(
      @Param("id") int id,
      @Param("provider") String provider,
      @Param("provider_id") String providerId,
      @Param("user_id") int userId);

  @Insert(
      "INSERT INTO conversations(id,title,project_id) VALUES ( #{id} ,#{title} ,#{project_id} )")
  void insertConversation(
      @Param("id") int id, @Param("title") String title, @Param("project_id") int projectId);

  @Insert(
      "INSERT INTO messages(id,conversation_id,role,content) VALUES ( #{id} ,#{conversation_id} ,#{role} ,#{content} )")
  void insertMessage(
      @Param("id") int id,
      @Param("conversation_id") int conversationId,
      @Param("role") String role,
      @Param("content") String content);

  @Insert("INSERT INTO projects(id,creator_id,name) VALUES ( #{id} ,#{user_id} ,#{name} )")
  void insertProject(@Param("id") int id, @Param("user_id") int userId, @Param("name") String name);

  @Insert(
      "INSERT INTO project_members(project_id,user_id,role) VALUES ( #{project_id} ,#{user_id} ,'OWNER' )")
  void insertProjectMember(@Param("project_id") int projectId, @Param("user_id") int userId);

  @Insert(
      "INSERT INTO logical_entities(id, project_id, type, name, label, definition, status) VALUES (#{id}, #{project_id}, #{type, typeHandler=reengineering.ddd.teamai.mybatis.typehandler.LogicalEntityTypeHandler}, #{name}, #{label}, CAST(#{definition} AS jsonb), #{status})")
  void insertLogicalEntity(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("type") LogicalEntityDescription.Type type,
      @Param("name") String name,
      @Param("label") String label,
      @Param("definition") String definition,
      @Param("status") String status);

  @Insert(
      "INSERT INTO diagrams(id, project_id, title, type, viewport) VALUES (#{id}, #{project_id}, #{title}, #{type}, CAST(#{viewport} AS jsonb))")
  void insertDiagram(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("title") String title,
      @Param("type") String type,
      @Param("viewport") String viewport);

  @Insert(
      "INSERT INTO diagram_nodes(id, diagram_id, type, logical_entity_id, parent_id, position_x, position_y, width, height, style_config, local_data) "
          + "VALUES (#{id}, #{diagram_id}, #{type}, #{logical_entity_id}, #{parent_id}, #{position_x}, #{position_y}, #{width}, #{height}, CAST(#{style_config} AS jsonb), CAST(#{local_data} AS jsonb))")
  void insertDiagramNode(
      @Param("id") int id,
      @Param("diagram_id") int diagramId,
      @Param("type") String type,
      @Param("logical_entity_id") Integer logicalEntityId,
      @Param("parent_id") Integer parentId,
      @Param("position_x") double positionX,
      @Param("position_y") double positionY,
      @Param("width") Integer width,
      @Param("height") Integer height,
      @Param("style_config") String styleConfig,
      @Param("local_data") String localData);

  @Insert(
      "INSERT INTO diagram_edges(id, diagram_id, source_node_id, target_node_id, source_handle, target_handle, relation_type, label, style_props) "
          + "VALUES (#{id}, #{diagram_id}, #{source_node_id}, #{target_node_id}, #{source_handle}, #{target_handle}, #{relation_type}, #{label}, CAST(#{style_props} AS jsonb))")
  void insertDiagramEdge(
      @Param("id") int id,
      @Param("diagram_id") int diagramId,
      @Param("source_node_id") int sourceNodeId,
      @Param("target_node_id") int targetNodeId,
      @Param("source_handle") String sourceHandle,
      @Param("target_handle") String targetHandle,
      @Param("relation_type") String relationType,
      @Param("label") String label,
      @Param("style_props") String styleProps);
}
