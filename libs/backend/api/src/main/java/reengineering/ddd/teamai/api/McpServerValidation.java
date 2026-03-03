package reengineering.ddd.teamai.api;

import jakarta.ws.rs.BadRequestException;
import java.net.URI;
import java.util.Locale;
import java.util.Set;
import reengineering.ddd.teamai.description.McpServerDescription;

final class McpServerValidation {
  private static final Set<String> ALLOWED_STDIO_COMMANDS =
      Set.of("npx", "node", "uvx", "python", "python3", "docker", "codex");

  private static final Set<String> ALLOWED_NETWORK_HOSTS = Set.of("localhost", "127.0.0.1", "::1");

  private McpServerValidation() {}

  static void validate(McpServerDescription description) {
    if (description == null) {
      throw new BadRequestException("mcp server description must not be null");
    }
    String name = normalize(description.name());
    String target = normalize(description.target());
    if (name == null) {
      throw new BadRequestException("mcp server name must not be blank");
    }
    if (target == null) {
      throw new BadRequestException("mcp server target must not be blank");
    }
    if (description.transport() == null) {
      throw new BadRequestException("mcp server transport must not be null");
    }
    if (description.transport() == McpServerDescription.Transport.STDIO) {
      validateStdioTarget(target);
      return;
    }
    validateNetworkTarget(target, description.transport());
  }

  static String normalize(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private static void validateStdioTarget(String target) {
    String[] parts = target.split("\\s+");
    if (parts.length == 0 || parts[0].isBlank()) {
      throw new BadRequestException("stdio target must include a command");
    }
    String command = parts[0].toLowerCase(Locale.ROOT);
    if (!ALLOWED_STDIO_COMMANDS.contains(command)) {
      throw new BadRequestException("stdio command is not in whitelist: " + parts[0]);
    }
  }

  private static void validateNetworkTarget(
      String target, McpServerDescription.Transport transport) {
    URI uri;
    try {
      uri = URI.create(target);
    } catch (IllegalArgumentException error) {
      throw new BadRequestException(
          "invalid " + transport.name().toLowerCase(Locale.ROOT) + " target");
    }
    String scheme = uri.getScheme();
    String host = uri.getHost();
    if (scheme == null || host == null) {
      throw new BadRequestException(
          transport.name().toLowerCase(Locale.ROOT) + " target must be an absolute URL");
    }
    String normalizedScheme = scheme.toLowerCase(Locale.ROOT);
    if (!normalizedScheme.equals("http") && !normalizedScheme.equals("https")) {
      throw new BadRequestException(
          transport.name().toLowerCase(Locale.ROOT) + " target must use http or https");
    }
    if (!ALLOWED_NETWORK_HOSTS.contains(host.toLowerCase(Locale.ROOT))) {
      throw new BadRequestException("target host is not in whitelist: " + host);
    }
  }
}
