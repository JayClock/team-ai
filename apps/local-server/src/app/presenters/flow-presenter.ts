import type { FlowListPayload, FlowPayload } from '../schemas/flow';

function presentFlowResource(flow: FlowPayload, projectId: string) {
  return {
    _links: {
      collection: {
        href: `/api/projects/${projectId}/flows`,
      },
      self: {
        href: `/api/projects/${projectId}/flows/${flow.id}`,
      },
    },
    ...flow,
  };
}

export function presentFlow(flow: FlowPayload, projectId: string) {
  return presentFlowResource(flow, projectId);
}

export function presentFlowList(payload: FlowListPayload) {
  return {
    _embedded: {
      flows: payload.items.map((flow) =>
        presentFlowResource(flow, payload.projectId),
      ),
    },
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/flows`,
      },
    },
  };
}
