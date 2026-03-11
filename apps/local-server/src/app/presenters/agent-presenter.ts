import type { AgentListPayload, AgentPayload } from '../schemas/agent';

function createAgentLinks(agent: AgentPayload) {
  return {
    self: {
      href: `/api/projects/${agent.projectId}/agents/${agent.id}`,
    },
    collection: {
      href: `/api/projects/${agent.projectId}/agents`,
    },
    project: {
      href: `/api/projects/${agent.projectId}`,
    },
  };
}

export function presentAgent(agent: AgentPayload) {
  return {
    _links: createAgentLinks(agent),
    ...agent,
  };
}

export function presentAgentList(payload: AgentListPayload) {
  const query = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/agents?${query.toString()}`,
      },
      root: {
        href: '/api',
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
    },
    _embedded: {
      agents: payload.items.map((agent) => ({
        _links: createAgentLinks(agent),
        ...agent,
      })),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    total: payload.total,
  };
}
