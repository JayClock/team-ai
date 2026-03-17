import type { ScheduleListPayload, SchedulePayload } from '../schemas/schedule';

function presentScheduleResource(schedule: SchedulePayload) {
  return {
    _links: {
      collection: {
        href: `/api/projects/${schedule.projectId}/schedules`,
      },
      self: {
        href: `/api/schedules/${schedule.id}`,
      },
      workflow: {
        href: `/api/workflows/${schedule.workflowId}`,
      },
    },
    ...schedule,
  };
}

export function presentSchedule(schedule: SchedulePayload) {
  return presentScheduleResource(schedule);
}

export function presentScheduleList(payload: ScheduleListPayload) {
  return {
    _embedded: {
      schedules: payload.items.map(presentScheduleResource),
    },
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/schedules`,
      },
    },
  };
}
