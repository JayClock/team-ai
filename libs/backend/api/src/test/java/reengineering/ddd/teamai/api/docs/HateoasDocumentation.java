package reengineering.ddd.teamai.api.docs;

import static org.springframework.restdocs.hypermedia.HypermediaDocumentation.linkWithRel;
import static org.springframework.restdocs.payload.PayloadDocumentation.fieldWithPath;
import static org.springframework.restdocs.payload.PayloadDocumentation.subsectionWithPath;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.request.RequestDocumentation.queryParameters;

import java.util.ArrayList;
import java.util.List;
import org.springframework.restdocs.hypermedia.HypermediaDocumentation;
import org.springframework.restdocs.hypermedia.LinkDescriptor;
import org.springframework.restdocs.hypermedia.LinksSnippet;
import org.springframework.restdocs.payload.FieldDescriptor;
import org.springframework.restdocs.request.PathParametersSnippet;
import org.springframework.restdocs.request.QueryParametersSnippet;

/**
 * Reusable documentation helpers for HATEOAS + HAL-FORMS APIs. Designed for internal developers,
 * external API consumers, and AI agents.
 */
public final class HateoasDocumentation {

  private HateoasDocumentation() {}

  // ===== Common Link Descriptors =====

  public static LinkDescriptor selfLink() {
    return linkWithRel("self").description("Canonical link to this resource");
  }

  public static LinkDescriptor loginLink() {
    return linkWithRel("login").description("OAuth2 login endpoint for authentication");
  }

  public static LinkDescriptor userLink() {
    return linkWithRel("user").description("Link to authenticated user's resource");
  }

  public static LinkDescriptor accountsLink() {
    return linkWithRel("accounts").description("Link to user's linked accounts collection");
  }

  public static LinkDescriptor conversationsLink() {
    return linkWithRel("conversations").description("Link to user's conversations collection");
  }

  public static LinkDescriptor projectsLink() {
    return linkWithRel("projects").description("Link to user's projects collection");
  }

  public static LinkDescriptor messagesLink() {
    return linkWithRel("messages").description("Link to conversation messages collection");
  }

  public static LinkDescriptor sendMessageLink() {
    return linkWithRel("chat")
        .description("SSE streaming endpoint for sending messages (see `_templates.chat`)");
  }

  public static LinkDescriptor nextPageLink() {
    return linkWithRel("next").optional().description("Link to next page (if available)");
  }

  public static LinkDescriptor prevPageLink() {
    return linkWithRel("prev").optional().description("Link to previous page (if available)");
  }

  // ===== Pagination Links =====

  public static LinksSnippet paginationLinks(LinkDescriptor... additionalLinks) {
    List<LinkDescriptor> links = new ArrayList<>();
    links.add(selfLink());
    links.add(nextPageLink());
    links.add(prevPageLink());
    links.addAll(List.of(additionalLinks));
    return HypermediaDocumentation.relaxedLinks(
        HypermediaDocumentation.halLinks(), links.toArray(LinkDescriptor[]::new));
  }

  /**
   * Creates a HAL links snippet with the given link descriptors. This is a convenience method that
   * wraps HypermediaDocumentation.links() with HAL extractor. Uses relaxed mode to ignore
   * undocumented links.
   */
  public static LinksSnippet halLinksSnippet(LinkDescriptor... descriptors) {
    return HypermediaDocumentation.relaxedLinks(HypermediaDocumentation.halLinks(), descriptors);
  }

  // ===== Common Path Parameters =====

  public static PathParametersSnippet userIdPathParameter() {
    return pathParameters(parameterWithName("userId").description("Unique identifier of the user"));
  }

  public static PathParametersSnippet conversationPathParameters() {
    return pathParameters(
        parameterWithName("userId").description("Unique identifier of the user"),
        parameterWithName("projectId").description("Unique identifier of the project"),
        parameterWithName("conversationId").description("Unique identifier of the conversation"));
  }

  public static PathParametersSnippet messagePathParameters() {
    return pathParameters(
        parameterWithName("userId").description("Unique identifier of the user"),
        parameterWithName("projectId").description("Unique identifier of the project"),
        parameterWithName("conversationId").description("Unique identifier of the conversation"),
        parameterWithName("messageId").description("Unique identifier of the message"));
  }

  // ===== Pagination Query Parameters =====

  public static QueryParametersSnippet paginationParameters() {
    return queryParameters(
        parameterWithName("page").optional().description("Zero-based page index (default: 0)"),
        parameterWithName("size").optional().description("Page size (default: 40, max: 100)"));
  }

  // ===== Response Field Templates =====

  public static FieldDescriptor[] rootResponseFields() {
    return new FieldDescriptor[] {
      subsectionWithPath("_links").description("HATEOAS navigation links for API discovery")
    };
  }

  public static FieldDescriptor[] userResponseFields() {
    return new FieldDescriptor[] {
      fieldWithPath("id").description("Unique user identifier"),
      fieldWithPath("name").description("User's display name"),
      fieldWithPath("email").description("User's email address"),
      subsectionWithPath("_embedded.accounts[]").description("Embedded accounts collection"),
      subsectionWithPath("_embedded.projects[]").description("Embedded projects collection"),
      subsectionWithPath("_links").description("HATEOAS navigation links"),
      subsectionWithPath("_templates").description("HAL-FORMS action templates for AI agents")
    };
  }

  public static FieldDescriptor[] conversationResponseFields() {
    return new FieldDescriptor[] {
      fieldWithPath("id").description("Unique conversation identifier"),
      fieldWithPath("projectId").description("Unique project identifier"),
      fieldWithPath("title").description("Conversation title"),
      subsectionWithPath("_links").description("HATEOAS navigation links"),
      subsectionWithPath("_templates").description("HAL-FORMS action templates")
    };
  }

  public static FieldDescriptor[] pagedConversationsResponseFields() {
    return new FieldDescriptor[] {
      subsectionWithPath("_embedded.conversations[]")
          .description("Array of conversation resources"),
      fieldWithPath("_embedded.conversations[].id").description("Unique conversation identifier"),
      fieldWithPath("_embedded.conversations[].title").description("Conversation title"),
      subsectionWithPath("_embedded.conversations[]._links")
          .description("Links for each conversation"),
      subsectionWithPath("_embedded.conversations[]._templates")
          .description("Actions available for each conversation"),
      subsectionWithPath("_links").description("Pagination navigation links"),
      subsectionWithPath("page").description("Pagination metadata"),
      fieldWithPath("page.size").description("Number of items per page"),
      fieldWithPath("page.totalElements").description("Total number of items"),
      fieldWithPath("page.totalPages").description("Total number of pages"),
      fieldWithPath("page.number").description("Current page number (zero-based)")
    };
  }

  public static FieldDescriptor[] messageResponseFields() {
    return new FieldDescriptor[] {
      fieldWithPath("id").description("Unique message identifier"),
      fieldWithPath("role").description("Message role: `user` or `assistant`"),
      fieldWithPath("content").description("Message content text"),
      subsectionWithPath("_links").description("HATEOAS navigation links")
    };
  }

  public static FieldDescriptor[] messagesCollectionResponseFields() {
    return new FieldDescriptor[] {
      subsectionWithPath("_embedded.messages[]").description("Array of message resources"),
      fieldWithPath("_embedded.messages[].id").description("Unique message identifier"),
      fieldWithPath("_embedded.messages[].role").description("Message role: `user` or `assistant`"),
      fieldWithPath("_embedded.messages[].content").description("Message content text"),
      subsectionWithPath("_embedded.messages[]._links").description("Links for each message")
    };
  }

  public static FieldDescriptor[] accountResponseFields() {
    return new FieldDescriptor[] {
      fieldWithPath("id").description("Unique account identifier"),
      fieldWithPath("provider").description("OAuth provider name (e.g., github)"),
      fieldWithPath("providerId").description("Provider-specific user identifier"),
      subsectionWithPath("_links").description("HATEOAS navigation links")
    };
  }

  public static FieldDescriptor[] accountsCollectionResponseFields() {
    return new FieldDescriptor[] {
      subsectionWithPath("_embedded.accounts[]").description("Array of account resources"),
      fieldWithPath("_embedded.accounts[].id").description("Unique account identifier"),
      fieldWithPath("_embedded.accounts[].provider").description("OAuth provider name"),
      fieldWithPath("_embedded.accounts[].providerId").description("Provider-specific user ID"),
      subsectionWithPath("_embedded.accounts[]._links").description("Links for each account")
    };
  }

  // ===== Request Body Fields =====

  public static FieldDescriptor[] createConversationRequestFields() {
    return new FieldDescriptor[] {
      fieldWithPath("title").description("Title for the new conversation")
    };
  }

  public static FieldDescriptor[] updateConversationRequestFields() {
    return new FieldDescriptor[] {
      fieldWithPath("title").description("Updated title for the conversation")
    };
  }

  public static FieldDescriptor[] sendMessageRequestFields() {
    return new FieldDescriptor[] {
      fieldWithPath("role").description("Message role: `user` (for user input)"),
      fieldWithPath("content").description("Message content text to send to AI")
    };
  }
}
