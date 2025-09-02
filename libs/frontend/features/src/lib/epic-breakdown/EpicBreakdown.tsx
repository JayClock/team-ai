import { Button, Col, Flex, Row, Select } from 'antd';
import Text from 'antd/es/typography/Text';
import TextArea from 'antd/es/input/TextArea';
import { useQuery } from '@tanstack/react-query';
import { container } from '@web/persistent';
import { Contexts, ENTRANCES, User } from '@web/domain';
import { useMemo, useState } from 'react';

const contexts: Contexts = container.get(ENTRANCES.CONTEXTS);

export function EpicBreakdown(props: { user: User }) {
  const { user } = props;
  const [contextId, setContextId] = useState('');
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
  return (
    <Flex>
      <Flex vertical gap="middle">
        <Flex vertical gap="small">
          <Text>User Input</Text>
          <TextArea rows={20}></TextArea>
        </Flex>
        <Flex vertical gap="small">
          <Select
            placeholder={'请选择上下文'}
            options={options}
            onChange={(value) => setContextId(value)}
          ></Select>
          <Button type="primary">Generate</Button>
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
