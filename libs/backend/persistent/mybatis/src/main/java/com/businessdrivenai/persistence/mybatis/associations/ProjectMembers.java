package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.model.Member;
import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.ProjectMembersMapper;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;

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
  public Member invite(String userId, String role) {
    mapper.insertMember(projectId, userId, role);
    return mapper.findMemberByProjectAndUser(projectId, userId).orElse(null);
  }

  public void remove(String userId) {
    mapper.deleteMember(projectId, userId);
  }
}
