import { Link } from 'react-router-dom';
import { Button } from '@shared/ui/components/button';
import {
  ArrowLeftIcon,
  NetworkIcon,
  ZapIcon,
  DatabaseIcon,
  CheckCircleIcon,
  CodeIcon,
  ArrowRightIcon,
} from 'lucide-react';

const coreConcepts = [
  {
    icon: <NetworkIcon className="h-6 w-6" />,
    title: 'Association Objects',
    description:
      '使用 HasMany<K, V> 接口替代直接集合访问，解决 N+1 查询问题，同时保持模型纯净性',
    code: `public HasMany<String, Conversation> conversations() {
  return conversations;
}`,
    benefit: '性能优化 + 模型纯净',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: <ZapIcon className="h-6 w-6" />,
    title: 'Wide/Narrow Interfaces',
    description: '内部接口提供写操作，外部接口提供只读访问，确保封装性和安全性',
    code: `public interface Conversations 
    extends HasMany<String, Conversation> {
  Conversation add(ConversationDescription desc);
  void delete(String id);
}`,
    benefit: '封装 + 类型安全',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: <CodeIcon className="h-6 w-6" />,
    title: 'Intent-Revealing Methods',
    description:
      '使用意图明确的方法名称，而非通用 getter/setter，提高代码可读性',
    code: `public Message saveMessage(MessageDescription desc) {
  return messages.saveMessage(desc);
}`,
    benefit: '可读性 + 可维护性',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: <DatabaseIcon className="h-6 w-6" />,
    title: 'Zero-Copy API',
    description:
      'HATEOAS 层持有实体引用，而非 DTO 副本，减少内存消耗和数据同步问题',
    code: `public class ConversationResource {
  private final Conversation entity;
  // 持有引用，而非复制
}`,
    benefit: '性能 + 数据一致性',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
];

const comparison = [
  {
    traditional: 'List<Conversation> getConversations()',
    smart: 'HasMany<String, Conversation> conversations()',
    issue: 'N+1 查询、OOM 风险',
    solution: '懒加载、批量加载、缓存',
  },
  {
    traditional: 'public List<Conversation> conversations',
    smart: 'public HasMany<String, Conversation> conversations()',
    issue: '直接暴露内部状态',
    solution: '接口封装、意图明确',
  },
  {
    traditional: 'DTO 复制数据',
    smart: '持有实体引用',
    issue: '内存消耗、数据同步',
    solution: '零拷贝、直接访问',
  },
  {
    traditional: 'Service 层业务逻辑',
    smart: 'Domain 层封装逻辑',
    issue: '贫血领域模型',
    solution: '充血领域模型',
  },
];

const benefits = [
  {
    title: '性能优化',
    description: '通过 Association Objects 解决 N+1 查询，支持懒加载和批量加载',
    icon: <ZapIcon className="h-5 w-5" />,
  },
  {
    title: '模型纯净',
    description: '保持领域模型纯粹性，业务逻辑封装在领域对象内部',
    icon: <CheckCircleIcon className="h-5 w-5" />,
  },
  {
    title: '类型安全',
    description: '通过接口和泛型确保类型安全，编译期即可发现问题',
    icon: <CodeIcon className="h-5 w-5" />,
  },
  {
    title: '可测试性',
    description: '清晰的接口设计让单元测试和集成测试更容易编写',
    icon: <NetworkIcon className="h-5 w-5" />,
  },
];

export default function SmartDomainPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/80 border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              返回首页
            </Link>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <NetworkIcon className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-lg text-gray-900">
                Smart Domain
              </span>
            </div>
            <Link to="/login">
              <Button
                variant="default"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                开始使用
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Smart Domain DDD
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              下一代领域驱动设计架构，通过 Association Objects 模式解决传统 DDD
              的性能瓶颈， 实现模型纯净性与高性能的完美平衡
            </p>
          </div>

          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
              四大核心概念
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              每个概念都经过精心设计，解决传统 DDD 的实际问题
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {coreConcepts.map((concept, index) => (
                <div
                  key={index}
                  className="backdrop-blur-md bg-white/70 border border-gray-200/50 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300"
                >
                  <div
                    className={`inline-flex p-3 rounded-xl ${concept.bgColor} ${concept.color} mb-4`}
                  >
                    {concept.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {concept.title}
                  </h3>
                  <p className="text-gray-600 mb-4">{concept.description}</p>
                  <div className="bg-slate-900 rounded-lg p-4 mb-4 overflow-x-auto">
                    <pre className="text-sm text-gray-100 font-mono">
                      {concept.code}
                    </pre>
                  </div>
                  <div
                    className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1 rounded-full ${concept.bgColor} ${concept.color}`}
                  >
                    {concept.benefit}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-24">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
              传统 DDD vs Smart Domain
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              通过对比理解 Smart Domain 如何解决传统 DDD 的痛点
            </p>

            <div className="backdrop-blur-md bg-white/70 border border-gray-200/50 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="bg-red-50/50 p-6 border-b md:border-b-0 md:border-r border-gray-200/50">
                  <h3 className="text-xl font-bold text-red-700 mb-4">
                    传统 DDD
                  </h3>
                  <ul className="space-y-4">
                    {comparison.map((item, index) => (
                      <li key={index} className="flex flex-col gap-2">
                        <code className="bg-red-100/50 px-3 py-2 rounded text-sm text-red-700 font-mono overflow-x-auto">
                          {item.traditional}
                        </code>
                        <span className="text-sm text-red-600">
                          {item.issue}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-green-50/50 p-6">
                  <h3 className="text-xl font-bold text-green-700 mb-4">
                    Smart Domain
                  </h3>
                  <ul className="space-y-4">
                    {comparison.map((item, index) => (
                      <li key={index} className="flex flex-col gap-2">
                        <code className="bg-green-100/50 px-3 py-2 rounded text-sm text-green-700 font-mono overflow-x-auto">
                          {item.smart}
                        </code>
                        <span className="text-sm text-green-600">
                          {item.solution}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-24">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
              核心优势
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              Smart Domain 为您的项目带来的实际价值
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="backdrop-blur-md bg-white/70 border border-gray-200/50 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300"
                >
                  <div className="inline-flex p-3 rounded-xl bg-blue-500/10 text-blue-600 mb-4">
                    {benefit.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600 text-sm">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-24">
            <div className="backdrop-blur-xl bg-gradient-to-br from-blue-600/80 to-purple-600/80 border border-white/20 rounded-3xl p-8 lg:p-12 shadow-2xl">
              <div className="text-center">
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                  体验 Smart Domain 的力量
                </h2>
                <p className="text-blue-50 text-lg mb-8 max-w-2xl mx-auto">
                  立即开始使用 Team AI，感受高性能领域驱动设计的魅力
                </p>
                <div className="flex items-center justify-center gap-4">
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="secondary"
                      className="bg-white text-blue-600 hover:bg-gray-100 px-8"
                    >
                      免费开始使用
                      <ArrowRightIcon className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="lg"
                    className="bg-transparent text-white border-white hover:bg-white/10"
                  >
                    查看文档
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200/50 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <NetworkIcon className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">
                Smart Domain DDD
              </span>
            </div>
            <p className="text-sm text-gray-500">
              © 2026 Team AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
