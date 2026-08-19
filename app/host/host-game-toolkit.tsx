'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HostGameToolkitData } from '@/lib/host-game-types';
import { shuffledQuickQuestionOrder } from '@/lib/quick-quiz-order';

const QUICK_TEAMS = ['海岛组', '沙漠组', '家人组'] as const;
type QuickTeam = typeof QUICK_TEAMS[number];
type QuickRun = {
  status: 'ready' | 'playing' | 'stopped' | 'completed';
  questionIndex: number;
  correctCount: number;
  questionOrder: number[];
};
type ToolkitMode = 'quick' | 'charades' | 'random';

const TOOL_OPTIONS: Array<{ id: ToolkitMode; number: string; title: string; subtitle: string }> = [
  { id: 'quick', number: '01', title: '快问快答', subtitle: '10 类正式题库' },
  { id: 'charades', number: '02', title: '你比划我猜', subtitle: '5 分钟轮换词库' },
  { id: 'random', number: '03', title: '田忌赛马', subtitle: '公平随机数字' },
];

function initialQuickRuns(): Record<QuickTeam, QuickRun> {
  return {
    海岛组: { status: 'ready', questionIndex: 0, correctCount: 0, questionOrder: [] },
    沙漠组: { status: 'ready', questionIndex: 0, correctCount: 0, questionOrder: [] },
    家人组: { status: 'ready', questionIndex: 0, correctCount: 0, questionOrder: [] },
  };
}

function secureRandomIndex(length: number) {
  if (length <= 1) return 0;
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) return Math.floor(Math.random() * length);
  const ceiling = Math.floor(0x100000000 / length) * length;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= ceiling);
  return value[0] % length;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function HostGameToolkit({ data }: { data: HostGameToolkitData }) {
  const [tool, setTool] = useState<ToolkitMode>('quick');
  const [quickCategoryId, setQuickCategoryId] = useState(data.quickQuiz[0]?.id ?? '');
  const [quickTeam, setQuickTeam] = useState<QuickTeam>('海岛组');
  const [quickRuns, setQuickRuns] = useState(initialQuickRuns);
  const [quickAnswerVisible, setQuickAnswerVisible] = useState(false);
  const [charadesCategoryId, setCharadesCategoryId] = useState(data.charades[0]?.id ?? '');
  const [charadesSeconds, setCharadesSeconds] = useState(300);
  const [charadesRunning, setCharadesRunning] = useState(false);
  const [charadesEndsAt, setCharadesEndsAt] = useState<number | null>(null);
  const [charadesCurrentIndex, setCharadesCurrentIndex] = useState<number | null>(null);
  const [charadesUsedIndices, setCharadesUsedIndices] = useState<number[]>([]);
  const [charadesHistory, setCharadesHistory] = useState<Array<{ word: string; result: 'correct' | 'skipped' }>>([]);
  const [randomMin, setRandomMin] = useState('0');
  const [randomMax, setRandomMax] = useState('9');
  const [randomValue, setRandomValue] = useState<number | null>(null);
  const [randomHistory, setRandomHistory] = useState<number[]>([]);

  const quickCategory = data.quickQuiz.find((item) => item.id === quickCategoryId) ?? data.quickQuiz[0];
  const formalQuestions = quickCategory?.questions.filter((question) => !question.backup) ?? [];
  const backupQuestions = quickCategory?.questions.filter((question) => question.backup) ?? [];
  const quickRun = quickRuns[quickTeam];
  const currentQuickQuestion = formalQuestions[quickRun.questionOrder[quickRun.questionIndex] ?? quickRun.questionIndex];
  const charadesCategory = data.charades.find((item) => item.id === charadesCategoryId) ?? data.charades[0];
  const currentCharadesWord = charadesCurrentIndex === null ? null : charadesCategory?.words[charadesCurrentIndex] ?? null;
  const charadesCorrect = charadesHistory.filter((item) => item.result === 'correct').length;
  const charadesSkipped = charadesHistory.filter((item) => item.result === 'skipped').length;
  useEffect(() => {
    if (!charadesRunning || charadesEndsAt === null) return;
    const synchronizeClock = () => {
      const remaining = Math.max(0, Math.ceil((charadesEndsAt - Date.now()) / 1000));
      setCharadesSeconds(remaining);
      if (remaining === 0) {
        setCharadesRunning(false);
        setCharadesEndsAt(null);
      }
    };
    synchronizeClock();
    const interval = window.setInterval(synchronizeClock, 250);
    return () => window.clearInterval(interval);
  }, [charadesEndsAt, charadesRunning]);

  function resetQuickCategory(categoryId: string) {
    setQuickCategoryId(categoryId);
    setQuickRuns(initialQuickRuns());
    setQuickTeam('海岛组');
    setQuickAnswerVisible(false);
  }

  function startQuickRun() {
    setQuickRuns((current) => ({
      ...current,
      [quickTeam]: {
        status: 'playing',
        questionIndex: 0,
        correctCount: 0,
        questionOrder: shuffledQuickQuestionOrder(formalQuestions.length, current[quickTeam].questionOrder, secureRandomIndex),
      },
    }));
    setQuickAnswerVisible(false);
  }

  function markQuickCorrect() {
    if (quickRun.status !== 'playing') return;
    setQuickRuns((current) => {
      const activeRun = current[quickTeam];
      if (activeRun.status !== 'playing') return current;
      return {
        ...current,
        [quickTeam]: activeRun.questionIndex >= formalQuestions.length - 1
          ? { ...activeRun, status: 'completed', correctCount: activeRun.correctCount + 1 }
          : { ...activeRun, questionIndex: activeRun.questionIndex + 1, correctCount: activeRun.correctCount + 1 },
      };
    });
    setQuickAnswerVisible(false);
  }

  function stopQuickRun() {
    if (quickRun.status !== 'playing') return;
    setQuickRuns((current) => ({ ...current, [quickTeam]: { ...quickRun, status: 'stopped' } }));
    setQuickAnswerVisible(false);
  }

  function resetCharades(categoryId = charadesCategoryId) {
    setCharadesCategoryId(categoryId);
    setCharadesSeconds(300);
    setCharadesRunning(false);
    setCharadesEndsAt(null);
    setCharadesCurrentIndex(null);
    setCharadesUsedIndices([]);
    setCharadesHistory([]);
  }

  function drawCharadesWord() {
    const words = data.charades.find((item) => item.id === charadesCategoryId)?.words ?? [];
    const available = words.map((_, index) => index).filter((index) => !charadesUsedIndices.includes(index));
    if (!available.length) {
      setCharadesCurrentIndex(null);
      setCharadesRunning(false);
      setCharadesEndsAt(null);
      return;
    }
    const next = available[secureRandomIndex(available.length)];
    setCharadesCurrentIndex(next);
    setCharadesUsedIndices((current) => [...current, next]);
  }

  function startCharades() {
    if (charadesSeconds === 0) return;
    if (charadesCurrentIndex === null) drawCharadesWord();
    setCharadesEndsAt(Date.now() + charadesSeconds * 1000);
    setCharadesRunning(true);
  }

  function pauseCharades() {
    if (!charadesRunning) return;
    if (charadesEndsAt !== null) {
      setCharadesSeconds(Math.max(0, Math.ceil((charadesEndsAt - Date.now()) / 1000)));
    }
    setCharadesEndsAt(null);
    setCharadesRunning(false);
  }

  function resolveCharadesWord(result: 'correct' | 'skipped') {
    if (!currentCharadesWord) return;
    setCharadesHistory((current) => [...current, { word: currentCharadesWord, result }]);
    drawCharadesWord();
  }

  function useRandomPreset(min: number, max: number) {
    setRandomMin(String(min));
    setRandomMax(String(max));
    setRandomValue(null);
  }

  const numericMin = Number(randomMin);
  const numericMax = Number(randomMax);
  const randomRangeValid = Number.isInteger(numericMin) && Number.isInteger(numericMax) && numericMin >= 0 && numericMax <= 999 && numericMin <= numericMax;

  function drawRandomNumber() {
    if (!randomRangeValid) return;
    const next = numericMin + secureRandomIndex(numericMax - numericMin + 1);
    setRandomValue(next);
    setRandomHistory((current) => [next, ...current].slice(0, 12));
  }

  const activeTool = useMemo(() => TOOL_OPTIONS.find((item) => item.id === tool) ?? TOOL_OPTIONS[0], [tool]);

  return <section className="section-card host-score-panel host-game-toolkit">
    <div className="section-heading host-game-heading"><div><small>LIVE GAME ASSISTANT</small><h2>现场游戏助手</h2></div><span>3 个已开放</span></div>
    <p className="host-game-intro">只辅助主持、计时和抽题，不会自动切换婚礼环节或修改积分。游戏结束后请到“团队计分”或“个人加分”记录结果。</p>
    <nav className="host-game-picker" aria-label="选择现场游戏">{TOOL_OPTIONS.map((item) => <button type="button" key={item.id} className={tool === item.id ? 'active' : ''} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}><small>{item.number}</small><strong>{item.title}</strong><span>{item.subtitle}</span></button>)}</nav>
    <div className="host-game-coming-soon" role="note"><small>04 · 稍后开放</small><strong>一站到底 · 新人问答</strong><span>等待你确认题目和答案后再启用，不展示半成品题库。</span></div>
    <div className="host-game-current"><small>{activeTool.number} · HOST TOOL</small><strong>{activeTool.title}</strong></div>

    {tool === 'quick' && <section className="host-game-panel" aria-label="快问快答主持工具">
      <div className="host-game-rules"><strong>现场规则</strong><p>三组使用同一类别、同一组 10 道题；每次开始以及失败重来都会重新打乱题序。每人依次回答一题，建议限时 3 秒。答错、超时或跳过立即结束本组挑战，并且不要公布正确答案。最先连续答对 10 题的组赢得本类别。</p></div>
      <label htmlFor="quick-category">本轮题目类别</label><select id="quick-category" value={quickCategoryId} onChange={(event) => resetQuickCategory(event.target.value)}>{data.quickQuiz.map((item) => <option value={item.id} key={item.id}>{item.title} · 10 题</option>)}</select>
      <div className="quick-team-tabs" role="group" aria-label="当前答题组">{QUICK_TEAMS.map((team) => { const run = quickRuns[team]; return <button type="button" key={team} className={quickTeam === team ? 'active' : ''} onClick={() => { setQuickTeam(team); setQuickAnswerVisible(false); }}><strong>{team}</strong><span>{run.status === 'completed' ? '已通关' : run.status === 'stopped' ? `${run.correctCount}/10 结束` : run.status === 'playing' ? `${run.questionIndex + 1}/10 答题中` : '等待开始'}</span></button>; })}</div>
      {quickRun.status === 'completed' ? <div className="quick-complete-state"><small>CATEGORY CLEARED</small><strong>{quickTeam}连续答对 10 题</strong><p>本类别已经通关。请按现场赛制记录胜出类别或进入下一类别。</p><button type="button" className="secondary" onClick={startQuickRun}>重排题序 · 再次挑战</button></div> : <div className="quick-question-card">
        <header><span>{quickRun.status === 'ready' ? '等待开始' : quickRun.status === 'stopped' ? '本组已结束' : `正式题 ${String(quickRun.questionIndex + 1).padStart(2, '0')} / 10`}</span><b>{quickCategory?.title}</b></header>
        <p>{currentQuickQuestion?.prompt ?? '题目载入中'}</p>
        <div className={`quick-answer ${quickAnswerVisible ? 'visible' : ''}`}><small>主持人答案</small><strong>{quickAnswerVisible ? currentQuickQuestion?.answer : '点击后仅主持人查看'}</strong></div>
        {quickRun.status === 'playing' ? <><button type="button" className="secondary host-answer-toggle" aria-pressed={quickAnswerVisible} onClick={() => setQuickAnswerVisible((current) => !current)}>{quickAnswerVisible ? '隐藏答案' : '显示答案'}</button><div className="quick-action-row"><button type="button" onClick={markQuickCorrect}>答对 · 下一题</button><button type="button" className="danger" onClick={stopQuickRun}>答错／超时 · 结束</button></div></> : <button type="button" onClick={startQuickRun}>{quickRun.status === 'stopped' ? '重排题序 · 从头挑战' : `开始${quickTeam}答题`}</button>}
      </div>}
      <details className="host-game-backups"><summary>平分加赛／替换题（2 题）</summary>{backupQuestions.map((question, index) => <article key={question.prompt}><span>备用 {index + 1}</span><strong>{question.prompt}</strong><small>答案：{question.answer}</small></article>)}</details>
    </section>}

    {tool === 'charades' && <section className="host-game-panel" aria-label="你比划我猜主持工具">
      <div className="host-game-rules"><strong>现场规则</strong><p>每组 5 分钟。队员轮流比划、其余组员猜词；猜对后切换下一词。不能说出题目中的字，是否允许跳过由主持人现场统一执行。</p></div>
      <label htmlFor="charades-category">词库类别</label><select id="charades-category" value={charadesCategoryId} disabled={charadesRunning} onChange={(event) => resetCharades(event.target.value)}>{data.charades.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.words.length} 词</option>)}</select>
      <div className={`charades-clock ${charadesSeconds <= 30 ? 'urgent' : ''}`}><small>剩余时间</small><strong>{formatClock(charadesSeconds)}</strong><span>{charadesRunning ? '计时进行中' : charadesSeconds === 0 ? '本轮时间到' : '等待主持人开始'}</span></div>
      <div className="charades-word"><small>CURRENT WORD</small><strong>{charadesSeconds === 0 ? '本轮结束' : currentCharadesWord ?? '开始后显示第一词'}</strong></div>
      <div className="charades-stats"><span>答对 <b>{charadesCorrect}</b></span><span>跳过 <b>{charadesSkipped}</b></span><span>已使用 <b>{charadesUsedIndices.length}/{charadesCategory?.words.length ?? 0}</b></span></div>
      <div className="charades-timer-actions"><button type="button" disabled={charadesSeconds === 0} onClick={() => charadesRunning ? pauseCharades() : startCharades()}>{charadesRunning ? '暂停计时' : charadesSeconds < 300 ? '继续计时' : '开始 5 分钟'}</button><button type="button" className="secondary" onClick={() => resetCharades()}>重置本轮</button></div>
      <div className="quick-action-row"><button type="button" disabled={!currentCharadesWord || charadesSeconds === 0} onClick={() => resolveCharadesWord('correct')}>猜对 · 下一词</button><button type="button" className="secondary" disabled={!currentCharadesWord || charadesSeconds === 0} onClick={() => resolveCharadesWord('skipped')}>跳过 · 换词</button></div>
      {charadesHistory.length > 0 && <details className="host-game-backups"><summary>查看本轮记录（{charadesHistory.length} 词）</summary>{[...charadesHistory].reverse().map((item, index) => <article key={`${item.word}-${index}`}><span>{item.result === 'correct' ? '答对' : '跳过'}</span><strong>{item.word}</strong></article>)}</details>}
    </section>}

    {tool === 'random' && <section className="host-game-panel" aria-label="田忌赛马随机数工具">
      <div className="host-game-rules"><strong>现场规则</strong><p>每组安排一位队员站出。主持人从 1–10 抽取奖励数字，或按玩家手中 0–9 的号码进行比大小；数字最大者胜出并获得对应奖励。</p></div>
      <div className="random-presets"><button type="button" className={randomMin === '1' && randomMax === '10' ? 'active' : ''} onClick={() => useRandomPreset(1, 10)}>奖励数 1–10</button><button type="button" className={randomMin === '0' && randomMax === '9' ? 'active' : ''} onClick={() => useRandomPreset(0, 9)}>队员号码 0–9</button></div>
      <div className="random-range"><label htmlFor="random-min">最小值<input id="random-min" type="number" inputMode="numeric" min="0" max="999" value={randomMin} onChange={(event) => { setRandomMin(event.target.value); setRandomValue(null); }}/></label><span>至</span><label htmlFor="random-max">最大值<input id="random-max" type="number" inputMode="numeric" min="0" max="999" value={randomMax} onChange={(event) => { setRandomMax(event.target.value); setRandomValue(null); }}/></label></div>
      {!randomRangeValid && <div className="notice error" role="alert">请输入 0–999 的整数，并确保最小值不大于最大值。</div>}
      <div className="random-result" aria-live="polite"><small>RANDOM RESULT</small><strong>{randomValue ?? '—'}</strong><span>{randomValue === null ? '点击下方按钮抽取' : `抽取范围 ${numericMin}–${numericMax}`}</span></div>
      <button type="button" disabled={!randomRangeValid} onClick={drawRandomNumber}>随机抽取一个数字</button>
      <p className="random-note">每次独立随机，数字可能重复。历史仅保留本页面最近 12 次，不写入游戏数据。</p>
      {randomHistory.length > 0 && <div className="random-history"><strong>最近结果</strong><div>{randomHistory.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div><button type="button" className="text-button" onClick={() => { setRandomHistory([]); setRandomValue(null); }}>清空记录</button></div>}
    </section>}

  </section>;
}
