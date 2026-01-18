import { Link } from 'react-router-dom';
import { Button } from '@shared/ui/components/button';
import {
  ArrowRightIcon,
  BrainIcon,
  GitBranchIcon,
  CheckCircleIcon,
  BookOpenIcon,
  LightbulbIcon,
  ShareIcon,
  RefreshCwIcon,
  LayersIcon,
} from 'lucide-react';

const stages = [
  {
    icon: <BrainIcon className="h-6 w-6" />,
    title: '分析建模',
    description: '从业务需求中提取核心知识，构建领域模型和知识图谱',
    knowledge: '知识提取与建模',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: <LayersIcon className="h-6 w-6" />,
    title: '任务拆解',
    description: '将领域知识结构化，分解为可执行的组件和服务',
    knowledge: '知识结构化',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: <CheckCircleIcon className="h-6 w-6" />,
    title: '测试开发',
    description: '通过测试用例验证知识准确性，确保业务逻辑正确实现',
    knowledge: '知识验证',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: <RefreshCwIcon className="h-6 w-6" />,
    title: '发布运维',
    description: '沉淀最佳实践和文档，建立知识复用机制，持续优化',
    knowledge: '知识沉淀与复用',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
];

const features = [
  {
    icon: <LightbulbIcon className="h-5 w-5" />,
    title: 'AI辅助知识提取',
    description: '自动识别领域概念和业务规则，生成领域模型',
  },
  {
    icon: <ShareIcon className="h-5 w-5" />,
    title: '知识共享机制',
    description: '团队知识库和文档自动同步，避免重复劳动',
  },
  {
    icon: <BookOpenIcon className="h-5 w-5" />,
    title: '智能文档生成',
    description: '从代码和模型自动生成技术文档和API说明',
  },
  {
    icon: <GitBranchIcon className="h-5 w-5" />,
    title: '知识版本管理',
    description: '追踪知识演进历史，支持回溯和对比分析',
  },
];

export default function Homepage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      <nav className="fixed top-4 left-4 right-4 z-50 backdrop-blur-md bg-white/90 border border-gray-200 rounded-2xl shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <BrainIcon className="h-5 w-5 text-white" />
                </div>
                <span className="font-semibold text-lg text-gray-900">
                  Team AI
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors duration-200"
              >
                登录
              </Link>
              <Button
                variant="default"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
              >
                开始使用
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                知识工程师
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              从分析建模到发布运维，每个阶段都注重知识的传递、沉淀和复用，让团队智慧持续增值
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link to="/login">
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 px-8"
                >
                  立即体验
                  <ArrowRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/smart-domain">
                <Button variant="outline" size="lg">
                  了解 Smart Domain
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
              知识传递的四大阶段
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              在软件开发的每个环节，我们都关注如何有效传递和沉淀知识
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stages.map((stage, index) => (
                <div
                  key={index}
                  className="group relative backdrop-blur-md bg-white/80 border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300"
                >
                  <div
                    className={`inline-flex p-3 rounded-xl ${stage.bgColor} ${stage.color} mb-4`}
                  >
                    {stage.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {stage.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-3">
                    {stage.description}
                  </p>
                  <div
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${stage.bgColor} ${stage.color}`}
                  >
                    {stage.knowledge}
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-24">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
              为什么选择知识工程
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              让知识成为团队的核心资产，持续积累和复用，提升整体生产力
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="backdrop-blur-md bg-white/80 border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300"
                >
                  <div className="inline-flex p-3 rounded-xl bg-blue-500/10 text-blue-600 mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-12">
              <div className="backdrop-blur-md bg-gradient-to-r from-purple-50/80 to-blue-50/80 border border-purple-200/50 rounded-2xl p-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      基于 Smart Domain DDD 架构
                    </h3>
                    <p className="text-gray-600">
                      采用下一代领域驱动设计，解决传统 DDD 的 N+1
                      查询问题，同时保持模型纯净性
                    </p>
                  </div>
                  <Link to="/smart-domain">
                    <Button
                      variant="default"
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap"
                    >
                      了解架构
                      <ArrowRightIcon className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-24">
            <div className="backdrop-blur-xl bg-gradient-to-br from-blue-600/80 to-purple-600/80 border border-white/20 rounded-3xl p-8 lg:p-12 shadow-2xl">
              <div className="text-center">
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                  准备好成为知识工程师了吗？
                </h2>
                <p className="text-blue-50 text-lg mb-8 max-w-2xl mx-auto">
                  加入数千名开发者，体验知识驱动的开发流程，让团队智慧持续增值
                </p>
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
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <BrainIcon className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-900">Team AI</span>
            </div>
            <p className="text-sm text-gray-600">
              © 2026 Team AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
