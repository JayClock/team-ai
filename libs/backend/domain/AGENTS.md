# UML 到代码单向同步思维链 (Chain of Thought)

## 概述

本文档提供了一个思维链（Chain of Thought），用于指导 AI 在 UML 图变更后如何同步更新 Java 代码实现。基于 [README.md](./README.md) 中的 PlantUML 图与实际 Java 代码之间的关系分析。

**重要原则：这是一个单向同步过程，AI 只能根据 UML 变更更新代码，绝对不能反向修改 UML 文档。**

## UML 变更后代码同步思维链

### 步骤 1: 分析 UML 变更类型

**思考问题:**

- UML 变更是添加新元素还是修改现有元素？
- 变更涉及的是实体、接口、关系还是属性？
- 变更是否影响继承层次结构？

**决策树:**

```
如果是添加新元素:
  ├── 新实体类 → 转到步骤 2A
  ├── 新接口 → 转到步骤 2B
  ├── 新描述对象 → 转到步骤 2C
  └── 新关系 → 转到步骤 2D

如果是修改现有元素:
  ├── 实体属性变更 → 转到步骤 3A
  ├── 接口方法变更 → 转到步骤 3B
  ├── 关系变更 → 转到步骤 3C
  └── 继承关系变更 → 转到步骤 3D
```

### 步骤 2: 添加新元素

#### 2A: 添加新实体类

```
思考过程:
1. 确定新实体类的名称和包路径
   - 包路径: reengineering.ddd.teamai.model
   - 类名: 与 UML 中定义一致

2. 检查实体是否实现 Entity 接口
   - 如果是，确定 Identity 和 Description 类型
   - 实现 getIdentity() 和 getDescription() 方法

3. 添加私有字段
   - identity 字段 (与 Identity 类型一致)
   - description 字段 (与 Description 类型一致)
   - 其他关联字段 (如 Accounts, Conversations 等)

4. 实现构造函数
   - 全参数构造函数
   - 私有无参构造函数 (用于框架)

5. 实现业务方法
   - 根据 UML 中的方法定义
   - 返回类型和参数与 UML 一致

6. 添加内部接口 (如果有)
   - 如 Accounts, Conversations 等 HasMany 关系
```

#### 2B: 添加新接口

```
思考过程:
1. 确定接口的名称和包路径
   - 架构接口: reengineering.ddd.archtype
   - 业务接口: reengineering.ddd.teamai.model

2. 定义接口方法
   - 方法名与 UML 一致
   - 参数类型和返回类型与 UML 一致
   - 考虑泛型参数

3. 添加必要导入
   - Entity, HasMany, Many 等相关接口
   - Optional, Stream 等 Java 标准库
```

#### 2C: 添加新描述对象

```
思考过程:
1. 确定描述对象的名称和包路径
   - 包路径: reengineering.ddd.teamai.description

2. 选择实现方式
   - 推荐: Java record (简洁且不可变)
   - 传统: class with private fields and getters

3. 定义字段
   - 字段名与 UML 属性一致
   - 类型与 UML 类型一致

4. 如果使用 record:
   - public record DescriptionName(FieldType1 field1, FieldType2 field2) {}
```

#### 2D: 添加新关系

```
思考过程:
1. 确定关系类型
   - 一对多: 使用 HasMany<E> 接口
   - 一对一: 直接引用

2. 确定关系方向
   - 单向: 只在源实体添加引用
   - 双向: 在两个实体都添加引用

3. 实现关系接口
   - 在实体内部定义内部接口
   - 继承 HasMany<ID, E>
   - 添加特定业务方法 (如 add, remove 等)

4. 更新实体类
   - 添加关系字段
   - 添加访问方法
   - 更新构造函数
```

### 步骤 3: 修改现有元素

#### 3A: 实体属性变更

```
思考过程:
1. 识别属性变更类型
   - 添加新属性
   - 修改现有属性类型
   - 删除属性

2. 更新描述对象
   - 添加新字段到相应的 Description record
   - 修改字段类型
   - 注意向后兼容性

3. 更新实体类
   - 添加私有字段
   - 更新构造函数参数
   - 添加 getter/setter 方法 (如需要)

4. 更新相关方法
   - 检查业务方法是否需要更新
   - 更新工厂方法 (如 add 方法)
```

#### 3B: 接口方法变更

```
思考过程:
1. 识别方法变更类型
   - 添加新方法
   - 修改方法签名
   - 删除方法

2. 更新接口定义
   - 添加/修改/删除方法声明
   - 注意泛型参数

3. 找到所有实现类
   - 使用搜索工具找到实现该接口的所有类
   - 更新实现类的方法

4. 检查调用代码
   - 搜索调用该方法的代码
   - 更新调用代码以适应新签名
```

#### 3C: 关系变更

```
思考过程:
1. 识别关系变更类型
   - 添加新关系
   - 修改关系类型 (如一对一改为一对多)
   - 删除关系

2. 更新实体类
   - 添加/修改/删除关系字段
   - 更新内部接口定义
   - 更新访问方法

3. 更新构造函数
   - 添加/修改/删除关系参数
   - 更新字段赋值

4. 检查级联操作
   - 添加/删除/修改级联方法
   - 如 add, remove 等方法
```

#### 3D: 继承关系变更

```
思考过程:
1. 识别继承变更类型
   - 添加新继承关系
   - 修改父接口
   - 删除继承关系

2. 更新类声明
   - 修改 implements 子句
   - 更新泛型参数

3. 实现新接口方法
   - 添加所有必需的方法实现
   - 确保方法签名与接口一致

4. 移除不需要的方法
   - 删除不再需要的接口方法实现
   - 检查是否有其他代码依赖这些方法
```

### 步骤 4: 验证和测试

```
思考过程:
1. 代码一致性检查
   - 确保所有 UML 元素都有对应的 Java 实现
   - 检查方法签名是否一致
   - 验证类型匹配

2. 编译检查
   - 运行 gradle compileJava
   - 修复编译错误

3. 单元测试
   - 检查是否有相关测试需要更新
   - 运行现有测试确保没有破坏
   - 为新功能添加测试

4. 集成测试
   - 检查依赖该模块的其他模块
   - 运行完整的构建流程
```

## 实际应用示例

### 示例 1: 添加新实体 "Team"

根据思维链:

1. **步骤 1**: 识别为添加新实体类 → 转到步骤 2A

2. **步骤 2A**:
  - 包路径: `reengineering.ddd.teamai.model`
  - 类名: `Team`
  - 实现 `Entity<String, TeamDescription>`
  - 添加字段: `identity`, `description`, `members`
  - 实现构造函数和方法
  - 添加内部接口 `Members extends HasMany<String, User>`

3. **步骤 2C**: 创建 `TeamDescription` record
  - 包路径: `reengineering.ddd.teamai.description`
  - 字段: `String name`, `String description`

4. **步骤 4**: 验证和测试

### 示例 2: 修改 User 实体添加新属性 "avatar"

根据思维链:

1. **步骤 1**: 识别为实体属性变更 → 转到步骤 3A

2. **步骤 3A**:
  - 更新 `UserDescription` record 添加 `String avatar` 字段
  - 更新 `User` 类的构造函数
  - 检查是否需要更新相关方法

3. **步骤 4**: 验证和测试

## 工具和命令

### 搜索相关文件

```bash
# 查找实现特定接口的类
find libs/backend/domain/src -name "*.java" -exec grep -l "implements.*InterfaceName" {} \;

# 查找调用特定方法的代码
find libs/backend/domain/src -name "*.java" -exec grep -l "methodName(" {} \;
```

### 编译和测试

```bash
cd libs/backend/domain
./gradlew compileJava
./gradlew test
```

## 注意事项

1. **命名一致性**: 确保 Java 代码中的命名与 UML 图完全一致
2. **类型安全**: 注意泛型参数的正确使用
3. **不可变性**: Description 对象应保持不可变 (推荐使用 record)
4. **向后兼容**: 修改现有代码时考虑向后兼容性
