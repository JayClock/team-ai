package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.cache.AssociationMapping;
import reengineering.ddd.teamai.mybatis.mappers.ProjectMembersMapper;

@AssociationMapping(entity = Project.class, field = "members", parentIdField = "projectId")
public class ProjectMembers extends EntityList<String, Member> implements Project.Members {

  private static final String CACHE_NAME = "projectMembers";

  private int projectId;

  @Inject private ProjectMembersMapper mapper;

  @Override
  protected List<Member> findEntities(int from, int to) {
    return mapper.findMembersByProjectId(projectId, from, to - from);
  }

  @Override
  protected Member findEntity(String userIdentity) {
    return mapper.findMemberByProjectAndUser(projectId, userIdentity).orElse(null);
  }

  @Override
  public int size() {
    return mapper.countMembersByProject(projectId);
  }

  @Override
  @CacheEvict(value = CACHE_NAME, allEntries = true)
  public Member addMember(reengineering.ddd.teamai.description.MemberDescription description) {
    String userId = description.user().id();
    String role = description.role();
    mapper.insertMember(projectId, userId, role);
    return mapper.findMemberByProjectAndUser(projectId, userId).orElse(null);
  }

  public void remove(String userId) {
    mapper.deleteMember(projectId, userId);
  }
}
