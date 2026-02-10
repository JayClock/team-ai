package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import java.util.Optional;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.context.ProjectContext;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.UsersMapper;
import reengineering.ddd.teamai.role.ProjectEditor;
import reengineering.ddd.teamai.role.ProjectOwner;
import reengineering.ddd.teamai.role.ProjectParticipant;
import reengineering.ddd.teamai.role.ProjectViewer;

@Component
public class Users implements reengineering.ddd.teamai.model.Users {

  private static final String CACHE_NAME = "users";

  private final UsersMapper mapper;
  private final Projects projects;

  @Inject
  public Users(UsersMapper mapper, Projects projects) {
    this.mapper = mapper;
    this.projects = projects;
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#id", unless = "#result == null")
  public Optional<User> findByIdentity(String id) {
    return Optional.ofNullable(mapper.findUserById(Integer.parseInt(id)));
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#result.getIdentity()")
  public User createUser(UserDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertUser(idHolder, description);
    return mapper.findUserById(idHolder.id());
  }

  @Override
  @CacheEvict(value = CACHE_NAME, key = "#id")
  public void update(String id, User.UserChange request) {
    mapper.updateUser(Integer.parseInt(id), request);
  }

  @Override
  public ProjectContext inProjectContext(Project project) {
    return new ProjectContext() {
      @Override
      public Optional<ProjectParticipant> asParticipant(User user, Project project) {
        java.util.Optional<Member> memberOpt = project.members().findByIdentity(user.getIdentity());

        if (!memberOpt.isPresent()) {
          return java.util.Optional.empty();
        }

        Member member = memberOpt.get();
        String role = member.getDescription().role();

        return java.util.Optional.ofNullable(
            switch (role) {
              case "OWNER" -> new ProjectOwner(user, project, projects);
              case "EDITOR" -> new ProjectEditor(user, project);
              case "VIEWER" -> new ProjectViewer(user, project);
              default -> null;
            });
      }
    };
  }
}
