export type GuestActivitySnapshot = {
  guestId: string;
  rehearsalRunId: string;
  stage: string;
  phaseNote: string;
  awakeningKey: string;
  dilemmaKey: string;
  copyKey: string;
  assignmentIds: string[];
  assignmentStatuses: Record<string, string>;
  clueIds: string[];
  confirmationIds: string[];
  relationshipIds: string[];
};

export type GuestActivityAck = {
  schemaVersion: 1;
  guestKey: string;
  rehearsalRunId: string;
  signature: string;
  stage: string;
  phaseNoteKey: string;
  awakeningKey: string;
  dilemmaKey: string;
  copyKey: string;
  assignmentKey: string;
  clueKey: string;
  confirmationKey: string;
  relationshipKey: string;
};

export type GuestActivitySuppression = {
  assignmentId?: string;
  dilemma?: boolean;
  copy?: boolean;
};

export type GuestActivityDecision =
  | { kind: 'none'; shouldBaseline: boolean }
  | { kind: 'awakening' }
  | { kind: 'dilemma-result' }
  | { kind: 'stage' }
  | { kind: 'assignment-updated'; assignmentId: string }
  | { kind: 'assignment-new'; assignmentId: string }
  | { kind: 'clue-new'; clueId: string }
  | { kind: 'confirmation-new'; confirmationId: string }
  | { kind: 'relationship-new'; relationshipId: string }
  | { kind: 'activity-bundle'; awakening: boolean; dilemmaResult: boolean; stage: boolean; assignment: boolean; assignmentId?: string }
  | { kind: 'phase-note' }
  | { kind: 'assignment-change' }
  | { kind: 'clue-change' }
  | { kind: 'confirmation-change' }
  | { kind: 'relationship-change' }
  | { kind: 'welcome' }
  | { kind: 'generic' };

export function activityFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeActivitySnapshot(snapshot: GuestActivitySnapshot): GuestActivitySnapshot {
  const assignmentIds = [...new Set(snapshot.assignmentIds)].sort();
  const assignmentStatuses = Object.fromEntries(assignmentIds.map((id) => [id, snapshot.assignmentStatuses[id] ?? '']));
  return {
    ...snapshot,
    copyKey: snapshot.copyKey ?? '',
    assignmentIds,
    assignmentStatuses,
    clueIds: [...new Set(snapshot.clueIds ?? [])].sort(),
    confirmationIds: [...new Set(snapshot.confirmationIds ?? [])].sort(),
    relationshipIds: [...new Set(snapshot.relationshipIds ?? [])].sort(),
  };
}

export function activitySignature(snapshot: GuestActivitySnapshot) {
  return activityFingerprint(JSON.stringify(normalizeActivitySnapshot(snapshot)));
}

function activityKeys(snapshot: GuestActivitySnapshot) {
  const normalized = normalizeActivitySnapshot(snapshot);
  return {
    signature: activitySignature(normalized),
    stage: normalized.stage,
    phaseNoteKey: activityFingerprint(normalized.phaseNote),
    awakeningKey: normalized.awakeningKey,
    dilemmaKey: normalized.dilemmaKey,
    copyKey: normalized.copyKey,
    assignmentKey: activityFingerprint(JSON.stringify([normalized.assignmentIds, normalized.assignmentStatuses])),
    clueKey: activityFingerprint(JSON.stringify(normalized.clueIds)),
    confirmationKey: activityFingerprint(JSON.stringify(normalized.confirmationIds)),
    relationshipKey: activityFingerprint(JSON.stringify(normalized.relationshipIds)),
  };
}

export function createGuestActivityAck(snapshot: GuestActivitySnapshot): GuestActivityAck {
  return {
    schemaVersion: 1,
    guestKey: activityFingerprint(snapshot.guestId),
    rehearsalRunId: snapshot.rehearsalRunId,
    ...activityKeys(snapshot),
  };
}

export function parseGuestActivityAck(raw: string | null): GuestActivityAck | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const stringFields = [
      'guestKey', 'rehearsalRunId', 'signature', 'stage', 'phaseNoteKey', 'awakeningKey',
      'dilemmaKey', 'assignmentKey', 'clueKey', 'confirmationKey',
    ];
    if (record.schemaVersion !== 1 || stringFields.some((field) => typeof record[field] !== 'string')) return null;
    // Older acknowledgements predate copy-choice and relationship activity.
    // Treat their empty state as acknowledged so deployment itself never
    // produces a fake "new activity" dialog for every returning guest.
    return {
      ...(record as unknown as GuestActivityAck),
      copyKey: typeof record.copyKey === 'string' ? record.copyKey : '',
      relationshipKey: typeof record.relationshipKey === 'string'
        ? record.relationshipKey
        : activityFingerprint(JSON.stringify([])),
    };
  } catch {
    return null;
  }
}

function sameActivityIdentity(snapshot: GuestActivitySnapshot, guestKey: string, rehearsalRunId: string) {
  return activityFingerprint(snapshot.guestId) === guestKey && snapshot.rehearsalRunId === rehearsalRunId;
}

function decideFromPrevious(
  previous: GuestActivitySnapshot,
  current: GuestActivitySnapshot,
  hasAwakening: boolean,
  hasDilemmaResult: boolean,
  suppression: GuestActivitySuppression,
): GuestActivityDecision {
  const before = normalizeActivitySnapshot(previous);
  const after = normalizeActivitySnapshot(current);
  const awakeningChanged = hasAwakening && Boolean(after.awakeningKey) && before.awakeningKey !== after.awakeningKey;
  const dilemmaChanged = Boolean(hasDilemmaResult && after.dilemmaKey && before.dilemmaKey !== after.dilemmaKey);
  const stageChanged = before.stage !== after.stage;
  const newAssignmentId = after.assignmentIds.find((assignmentId) => (
    !before.assignmentIds.includes(assignmentId) && ['assigned', 'rejected'].includes(after.assignmentStatuses[assignmentId])
  ));
  const assignmentChanged = before.assignmentIds.some((assignmentId) => (
    before.assignmentStatuses[assignmentId] !== after.assignmentStatuses[assignmentId]
  )) || Boolean(newAssignmentId);

  const suppressedAssignmentSubmitted = Boolean(
    suppression.assignmentId
    && ['assigned', 'rejected'].includes(before.assignmentStatuses[suppression.assignmentId])
    && after.assignmentStatuses[suppression.assignmentId] === 'submitted',
  );
  const suppressedDilemmaSubmitted = Boolean(
    suppression.dilemma
    && before.dilemmaKey !== after.dilemmaKey
    && after.dilemmaKey.includes(':waiting:'),
  );
  const suppressedCopySubmitted = Boolean(
    suppression.copy
    && before.copyKey !== after.copyKey
    && after.copyKey.includes(':waiting:'),
  );
  const unrelatedSnapshotChange = (
    before.phaseNote !== after.phaseNote
    || before.awakeningKey !== after.awakeningKey
    || JSON.stringify(before.clueIds) !== JSON.stringify(after.clueIds)
    || JSON.stringify(before.confirmationIds) !== JSON.stringify(after.confirmationIds)
    || JSON.stringify(before.relationshipIds) !== JSON.stringify(after.relationshipIds)
    || (before.dilemmaKey !== after.dilemmaKey && !suppressedDilemmaSubmitted)
    || (before.copyKey !== after.copyKey && !suppressedCopySubmitted)
    || (assignmentChanged && !suppressedAssignmentSubmitted)
  );
  if ((suppressedAssignmentSubmitted || suppressedDilemmaSubmitted || suppressedCopySubmitted)
      && !awakeningChanged && !dilemmaChanged && !stageChanged
      && !unrelatedSnapshotChange) {
    return { kind: 'none', shouldBaseline: true };
  }

  const bundleCount = Number(awakeningChanged) + Number(dilemmaChanged) + Number(stageChanged) + Number(Boolean(newAssignmentId));
  if (bundleCount > 1) return {
    kind: 'activity-bundle', awakening: awakeningChanged, dilemmaResult: dilemmaChanged,
    stage: stageChanged, assignment: Boolean(newAssignmentId), assignmentId: newAssignmentId,
  };
  if (awakeningChanged) return { kind: 'awakening' };
  if (dilemmaChanged) return { kind: 'dilemma-result' };
  if (stageChanged) return { kind: 'stage' };

  for (const assignmentId of after.assignmentIds) {
    const previousStatus = before.assignmentStatuses[assignmentId];
    const currentStatus = after.assignmentStatuses[assignmentId];
    if (previousStatus && previousStatus !== currentStatus && ['approved', 'rejected'].includes(currentStatus)) {
      return { kind: 'assignment-updated', assignmentId };
    }
  }
  if (newAssignmentId) return { kind: 'assignment-new', assignmentId: newAssignmentId };
  const clueId = after.clueIds.find((id) => !before.clueIds.includes(id));
  if (clueId) return { kind: 'clue-new', clueId };
  const confirmationId = after.confirmationIds.find((id) => !before.confirmationIds.includes(id));
  if (confirmationId) return { kind: 'confirmation-new', confirmationId };
  const relationshipId = after.relationshipIds.find((id) => !before.relationshipIds.includes(id));
  if (relationshipId) return { kind: 'relationship-new', relationshipId };
  // Accepting or rejecting an invitation removes it from the pending set. That
  // is the guest's own action, not a new activity worth interrupting them for.
  if (before.confirmationIds.length > after.confirmationIds.length
      || before.relationshipIds.length > after.relationshipIds.length) {
    return { kind: 'none', shouldBaseline: true };
  }
  if (before.phaseNote !== after.phaseNote && after.phaseNote) return { kind: 'phase-note' };
  if (before.phaseNote && !after.phaseNote) return { kind: 'none', shouldBaseline: true };
  if (activitySignature(before) !== activitySignature(after)) return { kind: 'generic' };
  return { kind: 'none', shouldBaseline: false };
}

function decideFromAck(
  ack: GuestActivityAck | null,
  current: GuestActivitySnapshot,
  hasAwakening: boolean,
  hasDilemmaResult: boolean,
  drawn: boolean,
  suppression: GuestActivitySuppression,
): GuestActivityDecision {
  const currentKeys = activityKeys(current);
  if (!ack || !sameActivityIdentity(current, ack.guestKey, ack.rehearsalRunId)) {
    if (hasAwakening && current.awakeningKey) return { kind: 'awakening' };
    if (hasDilemmaResult && current.dilemmaKey) return { kind: 'dilemma-result' };
    return drawn ? { kind: 'welcome' } : { kind: 'none', shouldBaseline: true };
  }
  const awakeningChanged = hasAwakening && Boolean(current.awakeningKey) && ack.awakeningKey !== current.awakeningKey;
  const dilemmaChanged = Boolean(hasDilemmaResult && current.dilemmaKey && ack.dilemmaKey !== current.dilemmaKey);
  const stageChanged = ack.stage !== current.stage;
  const assignmentChanged = ack.assignmentKey !== currentKeys.assignmentKey;
  const suppressedDilemmaSubmitted = Boolean(suppression.dilemma && ack.dilemmaKey !== current.dilemmaKey && current.dilemmaKey.includes(':waiting:'));
  const suppressedCopySubmitted = Boolean(suppression.copy && ack.copyKey !== current.copyKey && current.copyKey.includes(':waiting:'));
  const unrelatedKeyChanged = (
    ack.phaseNoteKey !== currentKeys.phaseNoteKey
    || ack.awakeningKey !== currentKeys.awakeningKey
    || ack.clueKey !== currentKeys.clueKey
    || ack.confirmationKey !== currentKeys.confirmationKey
    || ack.relationshipKey !== currentKeys.relationshipKey
    || (ack.dilemmaKey !== currentKeys.dilemmaKey && !suppressedDilemmaSubmitted)
    || (ack.copyKey !== currentKeys.copyKey && !suppressedCopySubmitted)
  );
  if ((suppressedDilemmaSubmitted || suppressedCopySubmitted)
      && !awakeningChanged && !dilemmaChanged && !stageChanged && !assignmentChanged
      && !unrelatedKeyChanged) {
    return { kind: 'none', shouldBaseline: true };
  }
  const bundleCount = Number(awakeningChanged) + Number(dilemmaChanged) + Number(stageChanged) + Number(assignmentChanged);
  if (bundleCount > 1) return {
    kind: 'activity-bundle', awakening: awakeningChanged, dilemmaResult: dilemmaChanged,
    stage: stageChanged, assignment: assignmentChanged,
  };
  if (awakeningChanged) return { kind: 'awakening' };
  if (dilemmaChanged) return { kind: 'dilemma-result' };
  if (ack.signature === currentKeys.signature) return { kind: 'none', shouldBaseline: false };
  if (stageChanged) return { kind: 'stage' };
  if (assignmentChanged) return { kind: 'assignment-change' };
  if (ack.clueKey !== currentKeys.clueKey) return { kind: 'clue-change' };
  if (ack.confirmationKey !== currentKeys.confirmationKey) {
    return current.confirmationIds.length ? { kind: 'confirmation-change' } : { kind: 'none', shouldBaseline: true };
  }
  if (ack.relationshipKey !== currentKeys.relationshipKey) {
    return current.relationshipIds.length ? { kind: 'relationship-change' } : { kind: 'none', shouldBaseline: true };
  }
  if (ack.phaseNoteKey !== currentKeys.phaseNoteKey && current.phaseNote) return { kind: 'phase-note' };
  if (ack.phaseNoteKey !== currentKeys.phaseNoteKey && !current.phaseNote) return { kind: 'none', shouldBaseline: true };
  if (ack.copyKey !== currentKeys.copyKey) return { kind: 'generic' };
  // Legacy acknowledgements can have a different aggregate signature even
  // when every component is identical. Do not turn a schema upgrade into a
  // fake user-facing activity.
  return { kind: 'none', shouldBaseline: true };
}

export function decideGuestActivity(input: {
  current: GuestActivitySnapshot;
  previous?: GuestActivitySnapshot | null;
  ack?: GuestActivityAck | null;
  hasAwakening: boolean;
  hasDilemmaResult: boolean;
  drawn: boolean;
  suppress?: GuestActivitySuppression;
}): GuestActivityDecision {
  const current = normalizeActivitySnapshot(input.current);
  const previous = input.previous ? normalizeActivitySnapshot(input.previous) : null;
  if (previous && previous.guestId === current.guestId && previous.rehearsalRunId === current.rehearsalRunId) {
    return decideFromPrevious(previous, current, input.hasAwakening, input.hasDilemmaResult, input.suppress ?? {});
  }
  return decideFromAck(input.ack ?? null, current, input.hasAwakening, input.hasDilemmaResult, input.drawn, input.suppress ?? {});
}

type ClipboardCopyDependencies = {
  writeText?: (value: string) => Promise<void>;
  fallbackCopy?: (value: string) => boolean;
};

function fallbackBrowserCopy(value: string) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  try { return document.execCommand('copy'); }
  catch { return false; }
  finally { textarea.remove(); }
}

export async function copyTextWithFallback(value: string, dependencies: ClipboardCopyDependencies = {}) {
  const writeText = dependencies.writeText
    ?? (typeof navigator !== 'undefined' ? navigator.clipboard?.writeText?.bind(navigator.clipboard) : undefined);
  if (writeText) {
    try {
      await writeText(value);
      return true;
    } catch {
      // Some in-app browsers expose the API but reject it. Fall through to a
      // selection-based copy while the original user interaction is active.
    }
  }
  try { return (dependencies.fallbackCopy ?? fallbackBrowserCopy)(value); }
  catch { return false; }
}
