package com.businessdrivenai.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Specifies the vendor-specific media type that should be used in the response Content-Type header.
 *
 * <p>This annotation works in conjunction with JAX-RS {@code @Produces} to enable content
 * negotiation while still returning vendor-specific Content-Type headers. The resource method
 * declares standard HATEOAS media types in {@code @Produces} (like hal-forms, hal+json) for content
 * negotiation, while this annotation specifies the actual vendor type to use in the response.
 *
 * <p>Example usage:
 *
 * <pre>{@code
 * @GET
 * @Produces({HateoasMediaTypes.HAL_FORMS, HateoasMediaTypes.HAL_JSON})
 * @VendorMediaType(ResourceTypes.USER)
 * public UserModel get() {
 *     return new UserModel(user, uriInfo);
 * }
 * }</pre>
 *
 * <p>In this example, the endpoint accepts requests with Accept headers like
 * "application/prs.hal-forms+json" or "application/hal+json", but the response Content-Type will be
 * "application/vnd.business-driven-ai.user+json".
 *
 * @see VendorMediaTypeInterceptor
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD})
public @interface VendorMediaType {
  /**
   * The vendor-specific media type to use in the response Content-Type header.
   *
   * @return the vendor media type string
   */
  String value();
}
