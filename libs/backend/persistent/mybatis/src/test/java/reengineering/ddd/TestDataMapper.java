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
      "INSERT INTO projects(id,user_id,name,domain_model) VALUES ( #{id} ,#{user_id} ,#{name} ,#{domain_model} )")
  void insertProject(
      @Param("id") int id,
      @Param("user_id") int userId,
      @Param("name") String name,
      @Param("domain_model") String domainModel);
}
