package com.businessdrivenai.api.options;

import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;

/**
 * Customizer interface for HalFormsConfiguration. Implementations can be registered as Spring beans
 * to dynamically add HalForms options from API modules.
 *
 * <p>Since HalFormsConfiguration is immutable (withOptions returns a new instance), each customize
 * call must return the new configuration.
 */
@FunctionalInterface
public interface HalFormsOptionsCustomizer {
  /**
   * Customize the HalFormsConfiguration.
   *
   * @param config the current configuration
   * @return the new configuration with additional options
   */
  HalFormsConfiguration customize(HalFormsConfiguration config);
}
