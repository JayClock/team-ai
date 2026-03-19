import type { AcpEventEnvelope } from '@shared/schema';

export function summarizeSessionEvent(event: AcpEventEnvelope): string | null {
  switch (event.update.eventType) {
    case 'session_info_update': {
      const title = event.update.sessionInfo?.title;
      if (title) {
        return `会话标题已更新为 ${title}。`;
      }
      return null;
    }
    case 'turn_complete':
      return null;
    case 'error':
      return (
        event.update.error?.message ??
        event.error?.message ??
        '执行过程中发生错误。'
      );
    default:
      return null;
  }
}
