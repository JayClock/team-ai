package reengineering.ddd.teamai.api.provider;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.preference.LayoutPreference;

@Component
@Provider
public class PreferHeaderInterceptor implements ContainerRequestFilter {
  @Override
  public void filter(ContainerRequestContext requestContext) throws IOException {
    String prefer = requestContext.getHeaderString(LayoutPreference.PREFER_HEADER);
    Set<String> layouts =
        LayoutPreference.parseLayouts(
            prefer == null || prefer.isBlank() ? List.of() : List.of(prefer));
    Set<String> unsupportedLayouts = LayoutPreference.findUnsupportedLayouts(layouts);
    if (!unsupportedLayouts.isEmpty()) {
      throw new jakarta.ws.rs.BadRequestException(
          "Unsupported Prefer layout value(s): " + String.join(", ", unsupportedLayouts));
    }
    if (!layouts.isEmpty()) {
      requestContext.setProperty(LayoutPreference.REQUEST_PROPERTY_LAYOUTS, layouts);
    }
  }
}
