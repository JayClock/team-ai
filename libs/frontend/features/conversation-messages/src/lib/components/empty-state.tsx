export function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center bg-linear-to-br from-gray-50 to-white">
      <div className="text-center max-w-sm mx-auto px-6">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <div className="text-gray-600 text-xl font-medium mb-2">
            选择一个对话
          </div>
          <div className="text-gray-400 text-sm leading-relaxed">
            从左侧列表中选择任意对话开始聊天，或创建新的对话开始交流
          </div>
        </div>
      </div>
    </div>
  );
}
