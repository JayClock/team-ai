import {
  AbstractChatProvider,
  TransformMessage,
  XRequestOptions,
} from '@ant-design/x-sdk';

export type CustomInput = {
  content: string;
  role: 'user' | 'assistant';
};

export type CustomOutput = {
  data: string;
};

export type CustomMessage = {
  content: string;
  role: 'user' | 'assistant';
};

export class CustomChatProvider<
  ChatMessage extends CustomMessage = CustomMessage,
  Input extends CustomInput = CustomInput,
  Output extends CustomOutput = CustomOutput,
> extends AbstractChatProvider<ChatMessage, Input, Output> {
  transformParams(
    requestParams: Partial<Input>,
    options: XRequestOptions<Input, Output>,
  ): Input {
    if (typeof requestParams !== 'object') {
      throw new Error('requestParams must be an object');
    }
    return {
      ...(options?.params || {}),
      ...(requestParams || {}),
    } as Input;
  }
  transformLocalMessage(requestParams: Partial<Input>): ChatMessage {
    return {
      content: requestParams.content,
      role: 'user',
    } as unknown as ChatMessage;
  }
  transformMessage(info: TransformMessage<ChatMessage, Output>): ChatMessage {
    const { originMessage, chunk } = info || {};
    if (
      !chunk ||
      !chunk?.data ||
      (chunk?.data && chunk?.data?.includes('[DONE]'))
    ) {
      return {
        content: originMessage?.content || '',
        role: 'assistant',
      } as ChatMessage;
    }
    const content = originMessage?.content || '';
    return {
      content: `${content || ''}${chunk.data || ''}`,
      role: 'assistant',
    } as ChatMessage;
  }
}
