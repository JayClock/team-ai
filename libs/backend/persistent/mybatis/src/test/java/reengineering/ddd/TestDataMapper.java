package reengineering.ddd;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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

  @Insert(
      "INSERT INTO projects(id,creator_id,name,domain_model) VALUES ( #{id} ,#{user_id} ,#{name} ,#{domain_model} )")
  void insertProject(
      @Param("id") int id,
      @Param("user_id") int userId,
      @Param("name") String name,
      @Param("domain_model") String domainModel);

  @Insert(
      "INSERT INTO project_members(project_id,user_id,role) VALUES ( #{project_id} ,#{user_id} ,'OWNER' )")
  void insertProjectMember(@Param("project_id") int projectId, @Param("user_id") int userId);

  @Insert(
      "INSERT INTO logical_entities(id, project_id, type, name, label, definition, status) VALUES (#{id}, #{project_id}, #{type}, #{name}, #{label}, CAST(#{definition} AS jsonb), #{status})")
  void insertLogicalEntity(
      @Param("id") int id,
      @Param("project_id") int projectId,
      @Param("type") String type,
      @Param("name") String name,
      @Param("label") String label,
      @Param("definition") String definition,
      @Param("status") String status);
}
