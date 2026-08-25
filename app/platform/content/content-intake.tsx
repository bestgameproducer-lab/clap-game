'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  ensureWeddingDraftId,
  getWeddingContentBrief,
  getWeddingCoupleName,
  isWeddingDraft,
  type PlatformContentBrief,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import styles from '../platform.module.css';

const LANGUAGE_OPTIONS = [
  { value: 'chinese', title: '中文为主', copy: '适合宾客共同语言明确的婚礼。' },
  { value: 'bilingual', title: '中英双语', copy: '关键任务、主持提示与规则同时提供中英文。' },
] as const;

const INTERACTION_OPTIONS = [
  { value: 'gentle', title: '轻松温和', copy: '减少公开表演，以祝福、观察和自然交流为主。' },
  { value: 'balanced', title: '自然平衡', copy: '兼顾害羞宾客与活跃宾客，保留少量舞台互动。' },
  { value: 'immersive', title: '高沉浸互动', copy: '隐藏身份、主动任务和终局判断占更大比重。' },
] as const;

const GUEST_MIX_OPTIONS = [
  { value: 'family', title: '家人与长辈为主', copy: '规则更直观，减少手机操作和陌生人压力。' },
  { value: 'balanced', title: '亲友较均衡', copy: '同时照顾家人、同学、同事与多年好友。' },
  { value: 'friends', title: '朋友为主', copy: '可以增加竞争、梗和彩蛋密度。' },
] as const;

export function ContentIntake() {
  const [draft, setDraft] = useState<WeddingDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('正在读取本机项目…');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isWeddingDraft(parsed)) return;
      setDraft(ensureWeddingDraftId(parsed));
      setMessage('内容问卷已与本机方案连接');
    } catch {
      setMessage('本机方案无法读取，请返回定制器重新确认');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || !draft) return;
    try {
      window.localStorage.setItem(PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setMessage('内容问卷已自动保存到这台设备');
    } catch {
      setMessage('浏览器未允许保存，请不要关闭当前页面');
    }
  }, [draft, ready]);

  const brief = useMemo(() => draft ? getWeddingContentBrief(draft) : null, [draft]);

  function update<K extends keyof PlatformContentBrief>(key: K, value: PlatformContentBrief[K]) {
    setDraft((current) => current ? {
      ...current,
      contentBrief: { ...getWeddingContentBrief(current), [key]: value },
    } : current);
  }

  if (!ready) return <section className={styles.contentLoading} aria-live="polite">正在读取本机项目…</section>;

  if (!draft || !brief) {
    return (
      <section className={styles.contentEmpty}>
        <p className={styles.eyebrow}>PROJECT REQUIRED</p>
        <h1>先创建婚礼方案，再填写内容问卷。</h1>
        <p>内容问卷会成为方案的一部分；它不会读取当前正式婚礼或其他客户的数据。</p>
        <Link className={styles.primaryAction} href="/platform/create">创建婚礼方案 <span>→</span></Link>
      </section>
    );
  }

  return (
    <div className={styles.contentLayout}>
      <section className={styles.contentHero}>
        <div>
          <p className={styles.eyebrow}>MAKE THE TEMPLATE FEEL LIKE YOU</p>
          <h1>玩法可以复用，<br />故事必须属于你们。</h1>
          <p>{getWeddingCoupleName(draft)} · 这份问卷用来确定文案、任务尺度和主持方式，不会自动公开给宾客。</p>
        </div>
        <div className={styles.draftStatus} aria-live="polite"><span className={styles.statusReady} /><div><strong>内容草稿</strong><small>{message}</small></div></div>
      </section>

      <form className={styles.contentForm} onSubmit={(event) => event.preventDefault()}>
        <fieldset className={styles.contentSection}>
          <legend><span>01</span><div><small>LANGUAGE</small><strong>宾客需要怎样阅读规则</strong></div></legend>
          <div className={styles.contentChoiceGrid}>{LANGUAGE_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={brief.language === option.value ? styles.contentChoiceSelected : styles.contentChoice} aria-pressed={brief.language === option.value} onClick={() => update('language', option.value)}><strong>{option.title}</strong><small>{option.copy}</small></button>
          ))}</div>
        </fieldset>

        <fieldset className={styles.contentSection}>
          <legend><span>02</span><div><small>INTERACTION</small><strong>希望现场多大胆</strong></div></legend>
          <div className={styles.contentChoiceGrid}>{INTERACTION_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={brief.interaction === option.value ? styles.contentChoiceSelected : styles.contentChoice} aria-pressed={brief.interaction === option.value} onClick={() => update('interaction', option.value)}><strong>{option.title}</strong><small>{option.copy}</small></button>
          ))}</div>
        </fieldset>

        <fieldset className={styles.contentSection}>
          <legend><span>03</span><div><small>GUEST MIX</small><strong>谁会一起进入故事</strong></div></legend>
          <div className={styles.contentChoiceGrid}>{GUEST_MIX_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={brief.guestMix === option.value ? styles.contentChoiceSelected : styles.contentChoice} aria-pressed={brief.guestMix === option.value} onClick={() => update('guestMix', option.value)}><strong>{option.title}</strong><small>{option.copy}</small></button>
          ))}</div>
        </fieldset>

        <fieldset className={styles.contentSection}>
          <legend><span>04</span><div><small>STORY MATERIAL</small><strong>把真正重要的细节交给我们</strong></div></legend>
          <label>最值得写进游戏的故事或共同记忆<textarea maxLength={2000} value={brief.storyMoments} onChange={(event) => update('storyMoments', event.target.value)} placeholder="例如：第一次旅行、共同爱好、朋友都知道的口头禅、求婚故事。" /><small>{brief.storyMoments.length}/2000</small></label>
          <label>绝对不要出现的话题、人物或互动<textarea maxLength={1200} value={brief.avoidTopics} onChange={(event) => update('avoidTopics', event.target.value)} placeholder="没有也请保留为空，然后勾选下方确认。" /><small>{brief.avoidTopics.length}/1200</small></label>
          <label className={styles.boundaryConfirmation}><input type="checkbox" checked={brief.boundariesConfirmed} onChange={(event) => update('boundariesConfirmed', event.target.checked)} /><span><strong>我们已经确认内容边界</strong><small>已列出需要避开的内容；如果没有特殊禁忌，也已明确确认。</small></span></label>
          <label>主持人口播与现场节奏备注<textarea maxLength={2000} value={brief.hostNotes} onChange={(event) => update('hostNotes', event.target.value)} placeholder="例如：主持人偏轻松，不安排临时上台；仪式结束后再开放强互动。" /><small>{brief.hostNotes.length}/2000</small></label>
        </fieldset>

        <section className={styles.contentNext}>
          <div><p className={styles.eyebrow}>NEXT STEP</p><h2>{brief.boundariesConfirmed ? '内容方向已经可以进入项目保存。' : '保存前，请先确认内容边界。'}</h2><p>登录不会自动上传问卷；只有你在账号页明确点击保存，资料才会进入独立客户项目。</p></div>
          <div><Link className={styles.primaryAction} href="/platform/account">前往账号与保存 <span>→</span></Link><Link className={styles.secondaryAction} href="/platform/create">返回方案定制</Link></div>
        </section>
      </form>
    </div>
  );
}
