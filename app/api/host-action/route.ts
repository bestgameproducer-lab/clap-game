import { requireAdmin } from '@/lib/auth';
import { adjustHostGuestPoints, adjustHostTeamPoints, setHostFinaleFlag, setHostGameStage, settleHostTeamChallengeClues } from '@/lib/data/host';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { MANUAL_GAME_STAGES } from '@/lib/game-rules';
import { assertSameOrigin, readJsonObject, requiredBoolean, requiredEnum, requiredInteger, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    const type = requiredString(body.type, '操作类型', 40);
    const currentRunId = () => requiredUuid(body.rehearsalRunId, '婚礼运行批次');
    if (type === 'adjustTeamPoints') {
      const total = await adjustHostTeamPoints({
        team: requiredEnum(body.team, '组别', ['海岛组', '沙漠组'] as const),
        amount: requiredInteger(body.amount, '团队计分', 0, 100),
        reason: requiredString(body.reason, '加分原因', 200),
        eventKey: requiredUuid(body.eventKey, '幂等事件 ID'),
        rehearsalRunId: currentRunId(),
      }, actor);
      return noStoreJson({ ok: true, total });
    }
    if (type === 'adjustGuestPoints') {
      const total = await adjustHostGuestPoints({
        guestId: requiredUuid(body.guestId, '宾客 ID'),
        amount: requiredInteger(body.amount, '个人加分', 1, 100),
        reason: requiredString(body.reason, '加分原因', 200),
        eventKey: requiredUuid(body.eventKey, '幂等事件 ID'),
        rehearsalRunId: currentRunId(),
      }, actor);
      return noStoreJson({ ok: true, total });
    }
    if (type === 'toggleVoting') {
      await setHostFinaleFlag('voting_open', requiredBoolean(body.value, '投票状态'), actor, currentRunId());
      return noStoreJson({ ok: true });
    }
    if (type === 'settleTeamClues') {
      return noStoreJson({ ok: true, settlement: await settleHostTeamChallengeClues(actor, currentRunId()) });
    }
    if (type === 'publishResults') {
      await setHostFinaleFlag('results_visible', true, actor, currentRunId());
      return noStoreJson({ ok: true });
    }
    if (type === 'setStage') {
      await setHostGameStage(requiredEnum(body.stage, '游戏阶段', MANUAL_GAME_STAGES), actor, currentRunId());
      return noStoreJson({ ok: true });
    }
    throw new ApiError(400, '未知操作');
  } catch (error) { return apiErrorResponse(error); }
}
