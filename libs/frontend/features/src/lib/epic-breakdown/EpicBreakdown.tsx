import { Button, Col, Flex, Row, Select } from 'antd';
import Text from 'antd/es/typography/Text';
import TextArea from 'antd/es/input/TextArea';

export function EpicBreakdown() {
  return (
    <Flex>
      <Flex vertical gap="middle">
        <Flex vertical gap="small">
          <Text>User Input</Text>
          <TextArea rows={20}></TextArea>
        </Flex>
        <Flex vertical gap="small">
          <Select></Select>
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
