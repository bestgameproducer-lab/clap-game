'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PLATFORM_MODULES, PLATFORM_THEMES, PLATFORM_TONES } from '@/lib/platform/catalog';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  ensureWeddingDraftId,
  formatWeddingDate,
  getWeddingCoupleName,
  getWeddingTemplateContent,
  isWeddingDraft,
  renderPlatformTemplateText,
  type WeddingDraft,
} from '@/lib/platform/draft';
import styles from '../platform.module.css';

type PreviewView = 'guest' | 'host' | 'scoreboard';

const VIEW_OPTIONS: Array<{ id: PreviewView; label: string; description: string }> = [
  { id: 'guest', label: '宾客入口', description: '邀请与分组视觉' },
  { id: 'host', label: '主持人题库', description: '问题、答案与词库' },
  { id: 'scoreboard', label: '积分大屏', description: '团队名称与现场氛围' },
];

export function TemplateExperiencePreview() {
  const [draft, setDraft] = useState<WeddingDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<PreviewView>('guest');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isWeddingDraft(parsed)) setDraft(ensureWeddingDraftId(parsed));
    } finally {
      setReady(true);
    }
  }, []);

  const preview = useMemo(() => {
    if (!draft) return null;
    const content = getWeddingTemplateContent(draft);
    return {
      content,
      couple: getWeddingCoupleName(draft),
      opening: renderPlatformTemplateText(content.openingScript, draft),
      theme: PLATFORM_THEMES.find((item) => item.id === draft.theme) ?? PLATFORM_THEMES[0],
      tone: PLATFORM_TONES.find((item) => item.id === draft.tone) ?? PLATFORM_TONES[0],
      modules: PLATFORM_MODULES.filter((module) => draft.modules.includes(module.id)),
    };
  }, [draft]);

  if (!ready) return <section className={styles.previewLoading}>正在读取这台设备上的定制草稿…</section>;
  if (!draft || !preview) {
    return <section className={styles.previewEmpty}><p className={styles.eyebrow}>LOCAL DRAFT REQUIRED</p><h1>先创建一份婚礼方案。</h1><p>体验预览只读取当前设备上的草稿，不会请求现有婚礼或其他客户项目。</p><Link className={styles.primaryAction} href="/platform/create">开始定制 <span>→</span></Link></section>;
  }

  const answerLabel = (answer: 'partnerOne' | 'partnerTwo' | 'both') => answer === 'partnerOne'
    ? (draft.partnerOne.trim() || '第一位新人')
    : answer === 'partnerTwo' ? (draft.partnerTwo.trim() || '第二位新人') : '两个人';

  return (
    <div className={styles.previewLayout}>
      <section className={styles.previewHero}>
        <div><p className={styles.eyebrow}>LOCAL · READ ONLY · NO LIVE DATA</p><h1>先看见婚礼，<br />再确认交付。</h1><p>{preview.couple} · {formatWeddingDate(draft.weddingDate)} · {draft.location.trim() || '地点待定'}</p></div>
        <div className={styles.previewSafety}><strong>纯本机模拟</strong><span>不登录宾客</span><span>不读取积分</span><span>不触发任何任务</span></div>
      </section>

      <nav className={styles.previewTabs} aria-label="预览界面">
        {VIEW_OPTIONS.map((option) => <button key={option.id} type="button" className={view === option.id ? styles.previewTabActive : styles.previewTab} aria-pressed={view === option.id} onClick={() => setView(option.id)}><strong>{option.label}</strong><small>{option.description}</small></button>)}
      </nav>

      <section className={`${styles.previewCanvas} ${styles[`previewTheme_${draft.theme}`]}`}>
        {view === 'guest' ? (
          <div className={styles.previewGuestPhone}>
            <small>A SECRET INVITATION</small><h2>{preview.couple}</h2><p>{preview.opening}</p>
            <div className={styles.previewGuestTeams}><span>{preview.content.teamOneName}</span><i>或</i><span>{preview.content.teamTwoName}</span></div>
            <button type="button" disabled>领取我的秘密身份 <b>→</b></button>
            <footer>{preview.theme.name} · {preview.tone.name} · 版式预览</footer>
          </div>
        ) : null}

        {view === 'host' ? (
          <div className={styles.previewHostDesk}>
            <header><div><small>HOST TOOLKIT PREVIEW</small><h2>主持人游戏台</h2></div><span>答案只在主持端显示</span></header>
            <div className={styles.previewHostGrid}>
              <article><small>快问快答</small><strong>{preview.content.quickQuizQuestions.length} 题</strong>{preview.content.quickQuizQuestions.slice(0, 3).map((question, index) => <p key={`${question.prompt}-${index}`}><b>{index + 1}</b><span>{question.prompt}<em>答案：{question.answer}</em></span></p>)}</article>
              <article><small>你比划我猜</small><strong>{preview.content.charadesWords.length} 词</strong><div>{preview.content.charadesWords.slice(0, 10).map((word, index) => <span key={`${word}-${index}`}>{word}</span>)}</div></article>
              <article><small>新人问答</small><strong>{preview.content.quizQuestions.length} 题</strong>{preview.content.quizQuestions.slice(0, 3).map((question, index) => <p key={`${question.prompt}-${index}`}><b>{index + 1}</b><span>{question.prompt}<em>答案：{answerLabel(question.answer)}</em></span></p>)}</article>
              <article><small>秘密任务文案</small><strong>{preview.content.missionCopyOverrides.length} 项定制</strong>{preview.content.missionCopyOverrides.length ? preview.content.missionCopyOverrides.slice(0, 3).map((override, index) => <p key={override.missionCode}><b>{index + 1}</b><span>{override.title}<em>{override.missionCode} · 规则与积分锁定</em></span></p>) : <p><b>✓</b><span>沿用旗舰模板文案<em>规则与积分始终锁定</em></span></p>}</article>
            </div>
          </div>
        ) : null}

        {view === 'scoreboard' ? (
          <div className={styles.previewScoreboard}>
            <small>LIVE SCOREBOARD · LAYOUT PREVIEW</small><h2>{preview.couple}</h2><p>正式婚礼前不会显示任何真实分数</p>
            <div><article><span>{preview.content.teamOneName}</span><strong>—</strong><small>等待游戏开始</small></article><i>VS</i><article><span>{preview.content.teamTwoName}</span><strong>—</strong><small>等待游戏开始</small></article></div>
            <footer>{preview.modules.map((module) => module.shortName).join(' · ') || '尚未选择游戏模块'}</footer>
          </div>
        ) : null}
      </section>

      <section className={styles.previewNext}><div><small>这不是正式婚礼实例</small><p>预览只验证内容层级和视觉方向。真实任务权限、宾客数据、计分与投票仍由每场婚礼的独立运行实例负责。</p></div><div><Link href="/platform/content">继续修改内容</Link><Link href="/platform/account">保存到客户项目</Link></div></section>
    </div>
  );
}
