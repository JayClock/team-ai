package com.businessdrivenai.persistence.mybatis.associations;

import com.businessdrivenai.domain.description.ConversationDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Project;
import com.businessdrivenai.persistence.database.EntityList;
import com.businessdrivenai.persistence.mybatis.cache.AssociationMapping;
import com.businessdrivenai.persistence.mybatis.mappers.ProjectConversationsMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.List;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;

@AssociationMapping(entity = Project.class, field = "conversations", parentIdField = "projectId")
public class ProjectConversations extends EntityList<String, Conversation>
    implements Project.Conversations {

  private static final String CACHE_NAME = "projectConversations";
  private static final String CACHE_LIST = "projectConversationsList";
  private static final String CACHE_COUNT = "projectConversationsCount";

  private int projectId;

  @Inject private ProjectConversationsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.projectId + ':' + #from + ':' + #to")
  protected List<Conversation> findEntities(int from, int to) {
    return mapper.findConversationsByProjectId(projectId, from, to - from);
  }

  @Override
  @Cacheable(
      value = CACHE_NAME,
      key = "#root.target.projectId + ':' + #id",
      unless = "#result == null")
  protected Conversation findEntity(String id) {
    return mapper.findConversationByProjectAndId(projectId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.projectId")
  public int size() {
    return mapper.countConversationsByProject(projectId);
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId"),
        @CacheEvict(value = CACHE_NAME, key = "#root.target.projectId + ':' + #id")
      })
  public Conversation add(ConversationDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertConversation(idHolder, projectId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(
      evict = {
        @CacheEvict(value = CACHE_LIST, allEntries = true),
        @CacheEvict(value = CACHE_COUNT, key = "#root.target.projectId"),
        @CacheEvict(value = CACHE_NAME, key = "#root.target.projectId + ':' + #id")
      })
  public void delete(String id) {
    mapper.deleteConversation(projectId, Integer.parseInt(id));
  }
}
