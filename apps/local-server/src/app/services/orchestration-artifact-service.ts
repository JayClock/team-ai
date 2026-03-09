import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type { OrchestrationArtifactPayload } from '../schemas/orchestration';

const artifactIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface ArtifactRow {
  content_json: string;
  created_at: string;
  id: string;
  kind: string;
  session_id: string;
  step_id: string;
  updated_at: string;
}

interface CreateOrchestrationArtifactInput {
  content: Record<string, unknown>;
  kind: string;
  sessionId: string;
  stepId: string;
}

function createArtifactId() {
  return `art_${artifactIdGenerator()}`;
}

function mapArtifactRow(row: ArtifactRow): OrchestrationArtifactPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    stepId: row.step_id,
    kind: row.kind,
    content: JSON.parse(row.content_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createOrchestrationArtifact(
  sqlite: Database,
  input: CreateOrchestrationArtifactInput,
): Promise<OrchestrationArtifactPayload> {
  const now = new Date().toISOString();
  const artifact: OrchestrationArtifactPayload = {
    id: createArtifactId(),
    sessionId: input.sessionId,
    stepId: input.stepId,
    kind: input.kind,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO orchestration_artifacts (
          id,
          session_id,
          step_id,
          kind,
          content_json,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @sessionId,
          @stepId,
          @kind,
          @contentJson,
          @createdAt,
          @updatedAt
        )
      `,
    )
    .run({
      id: artifact.id,
      sessionId: artifact.sessionId,
      stepId: artifact.stepId,
      kind: artifact.kind,
      contentJson: JSON.stringify(artifact.content),
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    });

  return artifact;
}

export async function listArtifactsBySession(
  sqlite: Database,
  sessionId: string,
): Promise<OrchestrationArtifactPayload[]> {
  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          step_id,
          kind,
          content_json,
          created_at,
          updated_at
        FROM orchestration_artifacts
        WHERE session_id = ?
        ORDER BY created_at ASC
      `,
    )
    .all(sessionId) as ArtifactRow[];

  return rows.map(mapArtifactRow);
}

export async function listArtifactsByStep(
  sqlite: Database,
  stepId: string,
): Promise<OrchestrationArtifactPayload[]> {
  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          step_id,
          kind,
          content_json,
          created_at,
          updated_at
        FROM orchestration_artifacts
        WHERE step_id = ?
        ORDER BY created_at ASC
      `,
    )
    .all(stepId) as ArtifactRow[];

  return rows.map(mapArtifactRow);
}

export async function getLatestArtifactByKind(
  sqlite: Database,
  sessionId: string,
  kind: string,
): Promise<OrchestrationArtifactPayload | null> {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          session_id,
          step_id,
          kind,
          content_json,
          created_at,
          updated_at
        FROM orchestration_artifacts
        WHERE session_id = ? AND kind = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(sessionId, kind) as ArtifactRow | undefined;

  return row ? mapArtifactRow(row) : null;
}
