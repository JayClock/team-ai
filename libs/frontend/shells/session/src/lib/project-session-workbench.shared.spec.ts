import {
  canRetryTask,
  formatStatusLabel,
  getTaskPrimaryAction,
  type TaskPanelItem,
} from './project-session-workbench.shared';

describe('project session workbench task actions', () => {
  it('enables execute actions for ready implementation tasks', () => {
    const item = createTaskPanelItem({
      kind: 'implement',
      status: 'READY',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'execute',
      enabled: true,
      label: '开始执行',
    });
    expect(canRetryTask(item)).toBe(false);
  });

  it('enables review actions for pending review tasks', () => {
    const item = createTaskPanelItem({
      kind: 'review',
      status: 'PENDING',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'review',
      enabled: true,
      label: '开始复核',
    });
  });

  it('uses a verify-specific label for verification tasks', () => {
    const item = createTaskPanelItem({
      kind: 'verify',
      status: 'READY',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'review',
      enabled: true,
      label: '开始验证',
    });
  });

  it('disables the primary action and enables retry when a task is waiting to retry', () => {
    const item = createTaskPanelItem({
      kind: 'implement',
      status: 'WAITING_RETRY',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'execute',
      enabled: false,
      label: '开始执行',
    });
    expect(canRetryTask(item)).toBe(true);
    expect(formatStatusLabel('WAITING_RETRY')).toBe('等待重试');
  });

  it('disables all task actions when an execution session is already attached', () => {
    const item = createTaskPanelItem({
      executionSessionId: 'acps_running',
      kind: 'review',
      status: 'RUNNING',
    });

    expect(getTaskPrimaryAction(item)).toMatchObject({
      action: 'review',
      enabled: false,
    });
    expect(canRetryTask(item)).toBe(false);
  });
});

function createTaskPanelItem(overrides: Partial<TaskPanelItem>): TaskPanelItem {
  return {
    id: 'task_123',
    source: 'task',
    status: 'PENDING',
    title: 'Task title',
    taskState: {} as TaskPanelItem['taskState'],
    ...overrides,
  };
}
