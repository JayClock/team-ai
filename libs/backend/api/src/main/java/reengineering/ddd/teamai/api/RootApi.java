package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.security.Principal;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import reengineering.ddd.infrastructure.security.config.SecurityConfig;
import reengineering.ddd.infrastructure.security.jwt.JwtUtil;
import reengineering.ddd.teamai.api.representation.RootModel;
import reengineering.ddd.teamai.description.LocalCredentialDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

@Component
@Path("/")
public class RootApi {
  private static final long COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

  @Inject Users users;
  @Inject Projects projects;
  @Inject AuthenticationManager authenticationManager;
  @Inject PasswordEncoder passwordEncoder;
  @Inject JwtUtil jwtUtil;

  @Context private ResourceContext resourceContext;

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public RootModel get(@Context SecurityContext securityContext, @Context UriInfo uriInfo) {
    Principal principal = securityContext.getUserPrincipal();

    if (principal == null) {
      return RootModel.anonymous(uriInfo);
    } else {
      String userId = principal.getName();
      return RootModel.authenticated(userId, uriInfo);
    }
  }

  @Path("users")
  public UsersApi users() {
    UsersApi usersApi = new UsersApi(users);
    return resourceContext.initResource(usersApi);
  }

  @Path("projects")
  public ProjectsApi globalProjects() {
    ProjectsApi globalProjectsApi = new ProjectsApi(projects);
    return resourceContext.initResource(globalProjectsApi);
  }

  @POST
  @Path("auth/login")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response login(@Valid LoginRequest request, @Context UriInfo uriInfo) {
    try {
      authenticationManager.authenticate(
          new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));
    } catch (BadCredentialsException | AuthenticationServiceException ex) {
      throw new WebApplicationException(
          "Invalid username or password", Response.Status.UNAUTHORIZED);
    }

    User user =
        users
            .findByUsername(request.getUsername())
            .orElseThrow(() -> new WebApplicationException(Response.Status.UNAUTHORIZED));
    return issueToken(user, Response.Status.OK, uriInfo);
  }

  @POST
  @Path("auth/register")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response register(
      @Valid RegisterRequest request,
      @Context SecurityContext securityContext,
      @Context UriInfo uriInfo) {
    if (users.findByUsername(request.getUsername()).isPresent()) {
      throw new WebApplicationException("Username already exists", Response.Status.CONFLICT);
    }

    User targetUser;
    Response.Status status;
    Principal principal = securityContext.getUserPrincipal();

    User existingByEmail = users.findByEmail(request.getEmail()).orElse(null);
    if (existingByEmail != null) {
      if (principal == null || !existingByEmail.getIdentity().equals(principal.getName())) {
        throw new WebApplicationException("Email already exists", Response.Status.CONFLICT);
      }
      targetUser = existingByEmail;
      status = Response.Status.OK;
    } else {
      targetUser = users.createUser(new UserDescription(request.getName(), request.getEmail()));
      status = Response.Status.CREATED;
    }

    String hash = passwordEncoder.encode(request.getPassword());
    LocalCredentialDescription credential =
        new LocalCredentialDescription(request.getUsername(), hash);
    users.bindLocalCredential(targetUser.getIdentity(), credential);

    return issueToken(targetUser, status, uriInfo);
  }

  @POST
  @Path("auth/bind-local")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public Response bindLocal(
      @Valid BindLocalRequest request,
      @Context SecurityContext securityContext,
      @Context UriInfo uriInfo) {
    Principal principal = securityContext.getUserPrincipal();
    if (principal == null) {
      throw new WebApplicationException(Response.Status.UNAUTHORIZED);
    }

    User user =
        users
            .findByIdentity(principal.getName())
            .orElseThrow(() -> new WebApplicationException(Response.Status.UNAUTHORIZED));

    User userByUsername = users.findByUsername(request.getUsername()).orElse(null);
    if (userByUsername != null && !userByUsername.getIdentity().equals(user.getIdentity())) {
      throw new WebApplicationException("Username already exists", Response.Status.CONFLICT);
    }

    String hash = passwordEncoder.encode(request.getPassword());
    LocalCredentialDescription credential =
        new LocalCredentialDescription(request.getUsername(), hash);
    users.bindLocalCredential(user.getIdentity(), credential);
    return issueToken(user, Response.Status.OK, uriInfo);
  }

  private Response issueToken(User user, Response.Status status, UriInfo uriInfo) {
    String token = jwtUtil.generateToken(user);
    ResponseCookie cookie =
        ResponseCookie.from(SecurityConfig.AUTH_TOKEN_COOKIE, token)
            .httpOnly(true)
            .secure(isSecureRequest(uriInfo))
            .path("/")
            .maxAge(COOKIE_MAX_AGE_SECONDS)
            .sameSite("Lax")
            .build();

    return Response.status(status)
        .header(HttpHeaders.SET_COOKIE, cookie.toString())
        .entity(new TokenResponse(token, user.getIdentity()))
        .build();
  }

  private boolean isSecureRequest(UriInfo uriInfo) {
    return "https".equalsIgnoreCase(uriInfo.getRequestUri().getScheme());
  }

  @Data
  @NoArgsConstructor
  public static class LoginRequest {
    @NotBlank
    @Size(max = 255)
    private String username;

    @NotBlank
    @Size(min = 8, max = 255)
    private String password;
  }

  @Data
  @NoArgsConstructor
  public static class RegisterRequest {
    @NotBlank
    @Size(max = 255)
    private String name;

    @NotBlank
    @Email
    @Size(max = 255)
    private String email;

    @NotBlank
    @Size(max = 255)
    private String username;

    @NotBlank
    @Size(min = 8, max = 255)
    private String password;
  }

  @Data
  @NoArgsConstructor
  public static class BindLocalRequest {
    @NotBlank
    @Size(max = 255)
    private String username;

    @NotBlank
    @Size(min = 8, max = 255)
    private String password;
  }

  public record TokenResponse(String token, String userId) {}
}
