package reengineering.ddd.teamai.mybatis.mappers;

import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import reengineering.ddd.teamai.model.Member;

@Mapper
public interface ProjectMembersMapper {
  List<Member> findMembersByProjectId(
      @Param("project_id") int projectId, @Param("from") int from, @Param("size") int size);

  Optional<Member> findMemberByProjectAndUser(
      @Param("project_id") int projectId, @Param("user_id") String userId);

  int insertMember(
      @Param("project_id") int projectId,
      @Param("user_id") String userId,
      @Param("role") String role);

  int countMembersByProject(@Param("project_id") int projectId);

  int deleteMember(@Param("project_id") int projectId, @Param("user_id") String userId);
}
