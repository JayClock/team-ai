import { State } from '@hateoas-ts/resource';
import { ProjectSessionWorkbench } from '@features/projects';
import { Project } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import {
  clearPendingProjectPrompt,
  projectTitle,
  readPendingProjectPrompt,
  useProjectSelection,
} from '@shells/sessions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function ProjectSessionPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { projects, selectedProject } = useProjectSelection();
  const currentProject = selectedProject;
  const projectState = currentProject as State<Project> | undefined;

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(() =>
    sessionId ? readPendingProjectPrompt(sessionId) : null,
  );

  useEffect(() => {
    setPendingPrompt(sessionId ? readPendingProjectPrompt(sessionId) : null);
  }, [sessionId]);

  const handlePendingPromptConsumed = useCallback(() => {
    if (!sessionId) {
      return;
    }
    clearPendingProjectPrompt(sessionId);
    setPendingPrompt(null);
  }, [sessionId]);

  const handleSessionNavigate = useCallback(
    (nextSessionId: string) => {
      if (!projectState) {
        return;
      }
      navigate(`/projects/${projectState.data.id}/sessions/${nextSessionId}`);
    },
    [navigate, projectState],
  );

  const safeSessionId = useMemo(() => sessionId ?? undefined, [sessionId]);

  if (projects.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>项目</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            当前还没有本地项目。
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentProject || !projectState || !safeSessionId) {
    return null;
  }

  return (
    <div className="min-w-0 h-[100dvh] overflow-hidden bg-background">
      <ProjectSessionWorkbench
        projectState={projectState}
        projectTitle={projectTitle(currentProject)}
        initialSessionId={safeSessionId}
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={handlePendingPromptConsumed}
        onSessionNavigate={handleSessionNavigate}
      />
    </div>
  );
}
