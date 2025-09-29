import { Button, Card, Col, Flex, Row, Select } from 'antd';
import Text from 'antd/es/typography/Text';
import TextArea from 'antd/es/input/TextArea';
import { useQuery } from '@tanstack/react-query';
import { container } from '@web/persistent';
import { Contexts, ENTRANCES, UserLegacy } from '@web/domain';
import { useMemo } from 'react';
import { XStream } from '@ant-design/x';
import { parse } from 'best-effort-json-parser';
import { marked } from 'marked';
import { useSignal } from '@preact/signals-react';
import { CopyOutlined } from '@ant-design/icons';

const contexts: Contexts = container.get(ENTRANCES.CONTEXTS);

interface WorkPackage {
  title: string;
  summary: string;
}

export function EpicBreakdown(props: { user: UserLegacy }) {
  const { user } = props;
  const contextId = useSignal('');
  const userInput = useSignal('');
  const workspaces = useSignal([]);
  const isLoading = useSignal(false);
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
    isLoading.value = true;
    const conversation = await user.addConversation({
      title: 'new conversation',
    });
    let fullContent = '';
    const stream = await conversation.chatToBreakdownEpic(
      contextId.value,
      userInput.value
    );
    for await (const chunk of XStream({ readableStream: stream })) {
      const newText = chunk.data?.trim() || '';
      fullContent += newText;
      workspaces.value = parse(fullContent);
    }
    isLoading.value = false;
  };
  return (
    <Flex style={{ width: '100%', minHeight: '100vh' }}>
      <Flex vertical gap="middle" style={{ width: 200, padding: 16 }}>
        <Flex vertical gap="small">
          <Text>Epic 用户故事输入</Text>
          <TextArea
            rows={20}
            value={userInput.value}
            onChange={(e) =>
              (userInput.value = (e.target as HTMLTextAreaElement).value)
            }
            style={{ resize: 'vertical', minHeight: 200 }}
          ></TextArea>
        </Flex>
        <Flex vertical gap="small">
          <Select
            placeholder={'请选择上下文'}
            options={options}
            onChange={(value) => (contextId.value = value)}
          ></Select>
          <Button
            loading={isLoading.value}
            disabled={isLoading.value}
            type="primary"
            onClick={() => createConversation()}
          >
            进行故事分解
          </Button>
        </Flex>
      </Flex>
      <div className="flex-1 p-4 overflow-auto">
        <Row gutter={[16, 16]} style={{ width: '100%' }}>
          {workspaces.value.map((workPackage: WorkPackage, index: number) => (
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
                <Button>
                  <CopyOutlined />
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </Flex>
  );
}
