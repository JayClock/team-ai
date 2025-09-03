package reengineering.ddd.teamai.mybatis.associations;

import jakarta.inject.Inject;
import jakarta.inject.Named;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.core.ParameterizedTypeReference;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reengineering.ddd.mybatis.database.EntityList;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.EpicDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Context;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.mybatis.mappers.ContextsMapper;
import reengineering.ddd.teamai.mybatis.mappers.MessagesMapper;

import java.util.List;

public class ConversationMessages extends EntityList<String, Message> implements Conversation.Messages {
  private int conversationId;

  @Inject
  private MessagesMapper mapper;
  @Inject
  private ContextsMapper contextsMapper;
  @Inject
  @Named("deepSeekChatClient")
  public ChatClient deepSeekChatClient;

  @Override
  protected List<Message> findEntities(int from, int to) {
    return mapper.subMessagesByConversation(conversationId, from, to - from);
  }

  @Override
  protected Message findEntity(String id) {
    return mapper.findMessageByConversationAndId(conversationId, Integer.parseInt(id));
  }

  @Override
  public int size() {
    return this.mapper.countMessagesByConversation(conversationId);
  }

  @Override
  public Message saveMessage(MessageDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertMessage(idHolder, conversationId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  public Flux<String> epicBreakdown(EpicDescription description) {
    var converter = new BeanOutputConverter<>(new ParameterizedTypeReference<List<WorkPackage>>() {
    });
    Context context = contextsMapper.findContextById(Integer.parseInt(description.contextId()));
    return this.deepSeekChatClient.prompt()
      .user(u -> u.text(epicBreakdownPrompt)
        .param("context", context.getDescription().content())
        .param("user_input", description.userInput())
        .param("format", converter.getFormat()))
      .stream().content();
  }

  @Override
  public Flux<String> sendMessage(MessageDescription description) {
    return Mono.fromCallable(() -> saveMessage(description))
      .flatMapMany(savedMessage -> {
        StringBuilder aiResponseBuilder = new StringBuilder();
        return this.deepSeekChatClient.prompt().user(description.content()).stream().content()
          .doOnNext(aiResponseBuilder::append)
          .doOnComplete(() -> {
            String fullAiResponse = aiResponseBuilder.toString();
            saveMessage(new MessageDescription("assistant", fullAiResponse));
          });
      });
  }

  String epicBreakdownPrompt = """
      ---
    identifier: requirements-breakdown-3a845a85
    title: "Requirements Breakdown"
    system: "You are a member of a software engineering team and are assisting me in requirements analysis."
    categories: ["analysis"]
    type: "cards"

    help_prompt_description: "Break down a larger requirement into smaller work packages"
    help_user_input: "Describe the requirement you want to break down"

    ---
    You are a member of a software engineering team and are assisting me in requirements analysis.

    ## TASK

    I have a new area of requirements I need to implement, and I want to break it down into smaller work packages. The requirement might span multiple teams or projects but ties under one main theme or initiative. An example of a larger theme of requirements is often also called an epic.

    Please break down the requirements provided by the user to produce multiple smaller packages that I could ultimately turn into user stories, each with a clear name and concise description.


    Do not pull out cross-functional or non-functional requirements into separate work packages, they should be implemented as each part of the work package. For example, do not create separate packages to "improve performance", or "make mobile ready", instead mention those in the work package description, if relevant.

    ## CONTEXT

    ~This is the application we're working on, as context:~

    {context}

    ~Here is the description of the requirement I want to break down:~

    {user_input}

    ## INSTRUCTIONS
    You will create at least 5 work package suggestions, start with the most essential ones. If you have more ideas, give me up to 10 packages.

    For the summaries, consider the following structure and make it easily readable by adding markdown formatting:
    ========

    **Description**

    <High level description of the work package. Consider starting with "As a <user>..." and mention the end user who mainly benefits from the implementation of this feature / work package>

    **Cross-functionals**
    <Call out cross-functional concerns separately, but only if relevant, and in particular if I provided you with any context that relates to cross-functional concerns>

    ========
    {format}
    """;

  record WorkPackage(String title, String summary) {
  }
}

