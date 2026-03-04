package reengineering.ddd;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
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
      "INSERT INTO user_credentials(user_id, username, password_hash) VALUES (#{user_id}, #{username}, #{password_hash})")
  void insertUserCredential(
      @Param("user_id") int userId,
      @Param("username") String username,
      @Param("password_hash") String passwordHash);

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
      "INSERT INTO logical_entities(id, project_id, type, sub_type, name, label, definition) VALUES (#{id}, #{project_id}, #{type, typeHandler=reengineering.ddd.teamai.mybatis.typehandler.LogicalEntityTypeHandler}, #{sub_type, typeHandler=reengineering.ddd.teamai.mybatis.typehandler.SubTypeHandler}, #{name}, #{label}, CAST(#{definition} AS jsonb))")
  void insertLogicalEntity(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("type") LogicalEntityDescription.Type type,
      @Param("sub_type") LogicalEntityDescription.SubType subType,
      @Param("name") String name,
      @Param("label") String label,
      @Param("definition") String definition);

  @Update(
      "UPDATE logical_entities SET label = #{label}, updated_at = CURRENT_TIMESTAMP WHERE project_id = #{project_id} AND id = #{id}")
  void updateLogicalEntityLabel(
      @Param("project_id") int projectId, @Param("id") int id, @Param("label") String label);

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

  @Update(
      "UPDATE diagram_nodes SET parent_id = #{parent_id} WHERE diagram_id = #{diagram_id} AND id = #{id}")
  void updateDiagramNodeParent(
      @Param("diagram_id") int diagramId,
      @Param("id") int nodeId,
      @Param("parent_id") Integer parentId);

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

  @Insert(
      "INSERT INTO diagram_versions(id, diagram_id, version_name, snapshot_data) "
          + "VALUES (#{id}, #{diagram_id}, #{version_name}, CAST(#{snapshot_data} AS jsonb))")
  void insertDiagramVersion(
      @Param("id") int id,
      @Param("diagram_id") int diagramId,
      @Param("version_name") String versionName,
      @Param("snapshot_data") String snapshotData);

  @Insert(
      "INSERT INTO project_agents(id, project_id, name, role, model_tier, status, parent_id) "
          + "VALUES (#{id}, #{project_id}, #{name}, #{role}, #{model_tier}, #{status}, #{parent_id})")
  void insertProjectAgent(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("name") String name,
      @Param("role") String role,
      @Param("model_tier") String modelTier,
      @Param("status") String status,
      @Param("parent_id") Integer parentId);

  @Insert(
      "INSERT INTO project_tasks("
          + "id, project_id, title, objective, scope, acceptance_criteria, verification_commands, "
          + "status, assigned_to, delegated_by, completion_summary, verification_verdict, verification_report"
          + ") VALUES ("
          + "#{id}, #{project_id}, #{title}, #{objective}, #{scope}, "
          + "CAST(#{acceptance_criteria} AS jsonb), CAST(#{verification_commands} AS jsonb), "
          + "#{status}, #{assigned_to}, #{delegated_by}, #{completion_summary}, "
          + "#{verification_verdict}, #{verification_report})")
  void insertProjectTask(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("title") String title,
      @Param("objective") String objective,
      @Param("scope") String scope,
      @Param("acceptance_criteria") String acceptanceCriteria,
      @Param("verification_commands") String verificationCommands,
      @Param("status") String status,
      @Param("assigned_to") Integer assignedTo,
      @Param("delegated_by") Integer delegatedBy,
      @Param("completion_summary") String completionSummary,
      @Param("verification_verdict") String verificationVerdict,
      @Param("verification_report") String verificationReport);

  @Insert(
      "INSERT INTO project_agent_events(id, project_id, type, agent_id, task_id, message, occurred_at) "
          + "VALUES (#{id}, #{project_id}, #{type}, #{agent_id}, #{task_id}, #{message}, #{occurred_at})")
  void insertProjectAgentEvent(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("type") String type,
      @Param("agent_id") Integer agentId,
      @Param("task_id") Integer taskId,
      @Param("message") String message,
      @Param("occurred_at") java.time.Instant occurredAt);

  @Insert(
      "INSERT INTO project_acp_sessions("
          + "id, project_id, actor_user_id, provider, mode, status, started_at, last_activity_at, completed_at, failure_reason, last_event_id"
          + ") VALUES ("
          + "#{id}, #{project_id}, #{actor_user_id}, #{provider}, #{mode}, #{status}, #{started_at}, #{last_activity_at}, #{completed_at}, #{failure_reason}, #{last_event_id})")
  void insertProjectAcpSession(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("actor_user_id") Integer actorUserId,
      @Param("provider") String provider,
      @Param("mode") String mode,
      @Param("status") String status,
      @Param("started_at") java.time.Instant startedAt,
      @Param("last_activity_at") java.time.Instant lastActivityAt,
      @Param("completed_at") java.time.Instant completedAt,
      @Param("failure_reason") String failureReason,
      @Param("last_event_id") String lastEventId);
}
