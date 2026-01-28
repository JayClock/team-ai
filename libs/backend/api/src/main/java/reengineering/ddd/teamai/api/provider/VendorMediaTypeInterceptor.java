package reengineering.ddd.teamai.api.provider;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.lang.reflect.Method;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.VendorMediaType;

/**
 * JAX-RS ContainerResponseFilter that overrides the response Content-Type with the vendor-specific
 * media type declared in {@link VendorMediaType} annotation.
 *
 * <p>This filter enables a two-phase content negotiation strategy:
 *
 * <ol>
 *   <li><b>Request phase:</b> The resource method's {@code @Produces} annotation accepts standard
 *       HATEOAS media types (hal-forms, hal+json) for content negotiation
 *   <li><b>Response phase:</b> This filter replaces the Content-Type with the vendor-specific type
 *       from {@code @VendorMediaType}
 * </ol>
 *
 * <p>Example:
 *
 * <pre>{@code
 * // Client sends: Accept: application/prs.hal-forms+json
 * &#64;GET
 * &#64;Produces({HateoasMediaTypes.HAL_FORMS, HateoasMediaTypes.HAL_JSON})
 * @VendorMediaType(ResourceTypes.USER)
 * public UserModel get() { ... }
 * // Response Content-Type: application/vnd.business-driven-ai.user+json
 * }</pre>
 *
 * @see VendorMediaType
 */
@Component
@Provider
public class VendorMediaTypeInterceptor implements ContainerResponseFilter {

  @Context private ResourceInfo resourceInfo;

  @Override
  public void filter(
      ContainerRequestContext requestContext, ContainerResponseContext responseContext)
      throws IOException {
    VendorMediaType vendorMediaType = findVendorMediaTypeAnnotation();

    if (vendorMediaType != null) {
      responseContext.getHeaders().putSingle("Content-Type", vendorMediaType.value());
    }
  }

  private VendorMediaType findVendorMediaTypeAnnotation() {
    if (resourceInfo == null) {
      return null;
    }
    Method resourceMethod = resourceInfo.getResourceMethod();
    if (resourceMethod == null) {
      return null;
    }
    return resourceMethod.getAnnotation(VendorMediaType.class);
  }
}
