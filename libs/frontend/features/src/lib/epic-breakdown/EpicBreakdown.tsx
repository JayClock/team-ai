import { Button, Card, Col, Flex, Row, Select } from 'antd';
import Text from 'antd/es/typography/Text';
import TextArea from 'antd/es/input/TextArea';
import { useQuery } from '@tanstack/react-query';
import { container } from '@web/persistent';
import { Contexts, ENTRANCES, User } from '@web/domain';
import { useMemo, useState } from 'react';
import { XStream } from '@ant-design/x';
import { parse } from 'best-effort-json-parser';
import { marked } from 'marked';

const contexts: Contexts = container.get(ENTRANCES.CONTEXTS);

interface WorkPackage {
  title: string;
  summary: string;
}

export function EpicBreakdown(props: { user: User }) {
  const { user } = props;
  const [contextId, setContextId] = useState('');
  const [userInput, setUserInput] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
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

  const createConversation = async () => {
    const conversation = await user.addConversation({
      title: 'new conversation',
    });
    let fullContent = '';
    const stream = await conversation.chatToBreakdownEpic(contextId, userInput);
    for await (const chunk of XStream({ readableStream: stream })) {
      const newText = chunk.data?.trim() || '';
      fullContent += newText;
      let output = parse(fullContent);
      setWorkspaces(output);
    }
  };
  return (
    <Flex style={{ width: '100%', minHeight: '100vh' }}>
      <Flex vertical gap="middle" style={{ width: 200, padding: 16 }}>
        <Flex vertical gap="small">
          <Text>User Input</Text>
          <TextArea
            rows={20}
            value={userInput}
            onChange={(e) =>
              setUserInput((e.target as HTMLTextAreaElement).value)
            }
            style={{ resize: 'vertical', minHeight: 200 }}
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
      <div className="flex-1 p-4 overflow-auto">
        <Row gutter={[16, 16]} style={{ width: '100%' }}>
          {workspaces.map((workPackage: WorkPackage, index: number) => (
            <Col xs={24} sm={12} md={12} lg={8} xl={8} key={index}>
              <Card title={workPackage.title} style={{ height: '100%' }}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: marked(workPackage.summary ?? ''),
                  }}
                  style={{
                    lineHeight: '1.6',
                    fontSize: '14px',
                    wordBreak: 'break-word',
                  }}
                  className="markdown-content"
                />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </Flex>
  );
}
