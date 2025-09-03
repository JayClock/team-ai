import { Button, Col, Flex, Row, Select } from 'antd';
import Text from 'antd/es/typography/Text';
import TextArea from 'antd/es/input/TextArea';
import { useMutation, useQuery } from '@tanstack/react-query';
import { container } from '@web/persistent';
import {
  Contexts,
  ConversationDescription,
  ENTRANCES,
  User,
} from '@web/domain';
import { useMemo, useState } from 'react';

const contexts: Contexts = container.get(ENTRANCES.CONTEXTS);

export function EpicBreakdown(props: { user: User }) {
  const { user } = props;
  const [contextId, setContextId] = useState('');
  const [userInput, setUserInput] = useState('');
  const { data } = useQuery({
    queryKey: ['contexts'],
    queryFn: async () => await contexts.findAll(),
  });

  const options = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.items().map((item) => ({
      label: item.getDescription().title,
      value: item.getIdentity(),
    }));
  }, [data]);

  const { mutate } = useMutation({
    mutationFn: (description: ConversationDescription) =>
      user.addConversation(description),
  });

  const createConversation = () => {
    mutate({ title: '' });
  };
  return (
    <Flex>
      <Flex vertical gap="middle">
        <Flex vertical gap="small">
          <Text>User Input</Text>
          <TextArea
            rows={20}
            value={userInput}
            onChange={(e) =>
              setUserInput((e.target as HTMLTextAreaElement).value)
            }
          ></TextArea>
        </Flex>
        <Flex vertical gap="small">
          <Select
            placeholder={'请选择上下文'}
            options={options}
            onChange={(value) => setContextId(value)}
          ></Select>
          <Button type="primary" onClick={() => createConversation()}>
            Generate
          </Button>
        </Flex>
      </Flex>
      <Row gutter={[16, 16]}>
        <Col span={6} />
        <Col span={6} />
        <Col span={6} />
        <Col span={6} />

        <Col span={6} />
        <Col span={6} />
        <Col span={6} />
        <Col span={6} />
      </Row>
    </Flex>
  );
}
