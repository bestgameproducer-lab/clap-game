import { requireAdmin } from '@/lib/auth';
import { publishHostSegment, saveHostSegment } from '@/lib/data/host';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { GAME_STAGES } from '@/lib/game-rules';
import { assertSameOrigin, optionalString, readJsonObject, requiredBoolean, requiredEnum, requiredInteger, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    const type = requiredString(body.type, '操作类型', 40);
    if (type === 'saveSegment') {
      const id = await saveHostSegment({
        id: body.segmentId ? requiredUuid(body.segmentId, '主持环节 ID') : null,
        title: requiredString(body.title, '标题', 120),
        stage: requiredEnum(body.stage, '游戏阶段', GAME_STAGES),
        publicPrompt: requiredString(body.publicPrompt, '公开内容', 1000),
        hostNotes: optionalString(body.hostNotes, '主持人提示', 2000),
        correctAnswer: optionalString(body.correctAnswer, '正确答案', 2000),
        publicClue: optionalString(body.publicClue, '公开线索', 500),
        timerMinutes: requiredInteger(body.timerMinutes, '倒计时', 0, 120),
        sortOrder: requiredInteger(body.sortOrder, '排序', 0, 9999),
        ready: requiredBoolean(body.ready, '发布状态'),
      }, actor);
      return noStoreJson({ ok: true, id });
    }
    if (type === 'publishSegment') {
      await publishHostSegment(requiredUuid(body.segmentId, '主持环节 ID'), actor);
      return noStoreJson({ ok: true });
    }
    throw new ApiError(400, '未知操作');
  } catch (error) { return apiErrorResponse(error); }
}
