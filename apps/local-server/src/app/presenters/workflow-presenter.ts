import type {
  WorkflowDefinitionPayload,
  WorkflowListPayload,
  WorkflowRunListPayload,
  WorkflowRunPayload,
} from '../schemas/workflow';

function presentWorkflowResource(workflow: WorkflowDefinitionPayload) {
  return {
    _links: {
      collection: {
        href: `/api/projects/${workflow.projectId}/workflows`,
      },
      runs: {
        href: `/api/workflows/${workflow.id}/runs`,
      },
      self: {
        href: `/api/workflows/${workflow.id}`,
      },
    },
    ...workflow,
  };
}

function presentWorkflowRunResource(workflowRun: WorkflowRunPayload) {
  return {
    _links: {
      cancel: {
        href: `/api/workflow-runs/${workflowRun.id}/cancel`,
      },
      reconcile: {
        href: `/api/workflow-runs/${workflowRun.id}/reconcile`,
      },
      retry: {
        href: `/api/workflow-runs/${workflowRun.id}/retry`,
      },
      self: {
        href: `/api/workflow-runs/${workflowRun.id}`,
      },
      workflow: {
        href: `/api/workflows/${workflowRun.workflowId}`,
      },
    },
    ...workflowRun,
  };
}

export function presentWorkflow(workflow: WorkflowDefinitionPayload) {
  return presentWorkflowResource(workflow);
}

export function presentWorkflowList(payload: WorkflowListPayload) {
  return {
    _embedded: {
      workflows: payload.items.map(presentWorkflowResource),
    },
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/workflows`,
      },
    },
  };
}

export function presentWorkflowRun(workflowRun: WorkflowRunPayload) {
  return presentWorkflowRunResource(workflowRun);
}

export function presentWorkflowRunList(payload: WorkflowRunListPayload) {
  return {
    _embedded: {
      workflowRuns: payload.items.map(presentWorkflowRunResource),
    },
    _links: {
      self: {
        href: `/api/workflows/${payload.workflowId}/runs`,
      },
    },
  };
}
