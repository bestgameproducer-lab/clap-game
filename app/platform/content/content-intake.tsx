'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  ensureWeddingDraftId,
  getWeddingContentBrief,
  getWeddingCoupleName,
  getWeddingTemplateContent,
  isWeddingDraft,
  PLATFORM_TEMPLATE_VARIABLES,
  renderPlatformTemplateText,
  type PlatformContentBrief,
  type PlatformTemplateContent,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import { PLATFORM_EDITABLE_MISSIONS, type PlatformEditableMissionCode } from '../../../lib/platform/mission-copy';
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
  const templateContent = useMemo(() => draft ? getWeddingTemplateContent(draft) : null, [draft]);

  function update<K extends keyof PlatformContentBrief>(key: K, value: PlatformContentBrief[K]) {
    setDraft((current) => current ? {
      ...current,
      contentBrief: { ...getWeddingContentBrief(current), [key]: value },
    } : current);
  }

  function updateTemplate<K extends keyof PlatformTemplateContent>(key: K, value: PlatformTemplateContent[K]) {
    setDraft((current) => current ? {
      ...current,
      templateContent: { ...getWeddingTemplateContent(current), [key]: value },
    } : current);
  }

  function addQuizQuestion() {
    if (!templateContent || templateContent.quizQuestions.length >= 20) return;
    updateTemplate('quizQuestions', [...templateContent.quizQuestions, { prompt: '', answer: 'partnerOne' }]);
  }

  function addQuickQuizQuestion() {
    if (!templateContent || templateContent.quickQuizQuestions.length >= 30) return;
    updateTemplate('quickQuizQuestions', [...templateContent.quickQuizQuestions, { prompt: '', answer: '' }]);
  }

  function addCharadesWord() {
    if (!templateContent || templateContent.charadesWords.length >= 80) return;
    updateTemplate('charadesWords', [...templateContent.charadesWords, '']);
  }

  function appendTemplateVariable(variable: (typeof PLATFORM_TEMPLATE_VARIABLES)[number]) {
    if (!templateContent) return;
    const spacer = templateContent.openingScript.endsWith(' ') || !templateContent.openingScript ? '' : ' ';
    const next = `${templateContent.openingScript}${spacer}{{${variable}}}`;
    if (next.length > 800) {
      setMessage('主持人开场口播已经达到 800 字上限。');
      return;
    }
    updateTemplate('openingScript', next);
  }

  function toggleMissionCopy(missionCode: PlatformEditableMissionCode) {
    if (!templateContent) return;
    const existing = templateContent.missionCopyOverrides.find((override) => override.missionCode === missionCode);
    if (existing) {
      updateTemplate('missionCopyOverrides', templateContent.missionCopyOverrides.filter((override) => override.missionCode !== missionCode));
      return;
    }
    const mission = PLATFORM_EDITABLE_MISSIONS.find((item) => item.missionCode === missionCode);
    if (!mission) return;
    updateTemplate('missionCopyOverrides', [...templateContent.missionCopyOverrides, {
      missionCode,
      title: mission.title,
      description: mission.description,
    }]);
  }

  function updateMissionCopy(missionCode: PlatformEditableMissionCode, key: 'title' | 'description', value: string) {
    if (!templateContent) return;
    updateTemplate('missionCopyOverrides', templateContent.missionCopyOverrides.map((override) => (
      override.missionCode === missionCode ? { ...override, [key]: value } : override
    )));
  }

  if (!ready) return <section className={styles.contentLoading} aria-live="polite">正在读取本机项目…</section>;

  if (!draft || !brief || !templateContent) {
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

        <fieldset className={styles.contentSection}>
          <legend><span>05</span><div><small>TEMPLATE CONTENT PACK</small><strong>把旗舰模板改成你们自己的版本</strong></div></legend>
          <div className={styles.teamNameGrid}>
            <label>第一组名称<input maxLength={40} value={templateContent.teamOneName} onChange={(event) => updateTemplate('teamOneName', event.target.value)} placeholder="例如：海岛组" /><small>{templateContent.teamOneName.length}/40</small></label>
            <label>第二组名称<input maxLength={40} value={templateContent.teamTwoName} onChange={(event) => updateTemplate('teamTwoName', event.target.value)} placeholder="例如：沙漠组" /><small>{templateContent.teamTwoName.length}/40</small></label>
          </div>
          {!templateContent.teamOneName.trim() || !templateContent.teamTwoName.trim() || templateContent.teamOneName.trim().toLowerCase() === templateContent.teamTwoName.trim().toLowerCase() ? <p className={styles.teamNameError} role="alert">请填写两个不同的队伍名称，否则无法生成名单、主持控制与积分榜。</p> : null}
          <label>主持人开场口播<textarea maxLength={800} value={templateContent.openingScript} onChange={(event) => updateTemplate('openingScript', event.target.value)} placeholder="写下主持人开场时可以直接使用的文字。" /><small>{templateContent.openingScript.length}/800</small></label>
          <div className={styles.templateVariablePicker} aria-label="可以插入的安全变量">
            <small>插入安全变量</small>
            <div>{PLATFORM_TEMPLATE_VARIABLES.map((variable) => <button key={variable} type="button" onClick={() => appendTemplateVariable(variable)}>{`{{${variable}}}`}</button>)}</div>
            <p>只支持以上变量；最终会以纯文字替换，不执行 HTML、脚本或代码。</p>
          </div>
          <div className={styles.templateScriptPreview}><small>实际口播预览</small><p>{renderPlatformTemplateText(templateContent.openingScript, draft)}</p></div>
          <div className={styles.quizBuilderHeading}><div><strong>新人问答题库</strong><small>最多 20 题 · 主持人可在现场直接查看答案</small></div><button type="button" onClick={addQuizQuestion} disabled={templateContent.quizQuestions.length >= 20}>＋ 添加题目</button></div>
          {templateContent.quizQuestions.length ? <div className={styles.quizBuilderList}>{templateContent.quizQuestions.map((question, index) => (
            <article key={index}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <label>问题<input maxLength={180} value={question.prompt} onChange={(event) => updateTemplate('quizQuestions', templateContent.quizQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))} placeholder="例如：谁更喜欢提前很久到机场？" /></label>
              <label>答案<select value={question.answer} onChange={(event) => updateTemplate('quizQuestions', templateContent.quizQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value as typeof item.answer } : item))}><option value="partnerOne">{draft.partnerOne.trim() || '第一位新人'}</option><option value="partnerTwo">{draft.partnerTwo.trim() || '第二位新人'}</option><option value="both">两个人</option></select></label>
              <button type="button" aria-label={`删除第 ${index + 1} 题`} onClick={() => updateTemplate('quizQuestions', templateContent.quizQuestions.filter((_, itemIndex) => itemIndex !== index))}>删除</button>
            </article>
          ))}</div> : <div className={styles.quizBuilderEmpty}>还没有新人问答。可以先保存空题库，之后再和婚礼策划师一起补充。</div>}
          {draft.modules.includes('team-games') ? (
            <div className={styles.moduleContentBanks}>
              <section>
                <div className={styles.quizBuilderHeading}><div><strong>组队快问快答题库</strong><small>最多 30 题 · 问题和答案只给主持人与运营审核查看</small></div><button type="button" onClick={addQuickQuizQuestion} disabled={templateContent.quickQuizQuestions.length >= 30}>＋ 添加题目</button></div>
                {templateContent.quickQuizQuestions.length ? <div className={styles.quickQuizBuilderList}>{templateContent.quickQuizQuestions.map((question, index) => (
                  <article key={index}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <label>问题<input maxLength={180} value={question.prompt} onChange={(event) => updateTemplate('quickQuizQuestions', templateContent.quickQuizQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))} placeholder="例如：一年有多少个月？" /></label>
                    <label>答案<input maxLength={120} value={question.answer} onChange={(event) => updateTemplate('quickQuizQuestions', templateContent.quickQuizQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} placeholder="例如：12 个月" /></label>
                    <button type="button" aria-label={`删除第 ${index + 1} 道快问快答`} onClick={() => updateTemplate('quickQuizQuestions', templateContent.quickQuizQuestions.filter((_, itemIndex) => itemIndex !== index))}>删除</button>
                  </article>
                ))}</div> : <div className={styles.quizBuilderEmpty}>还没有快问快答题目；可以添加自己的题库。</div>}
              </section>
              <section>
                <div className={styles.quizBuilderHeading}><div><strong>你比划我猜词库</strong><small>最多 80 个词 · 建议使用适合现场表演的短词</small></div><button type="button" onClick={addCharadesWord} disabled={templateContent.charadesWords.length >= 80}>＋ 添加词语</button></div>
                {templateContent.charadesWords.length ? <div className={styles.charadesBuilderList}>{templateContent.charadesWords.map((word, index) => (
                  <label key={index}><span>{String(index + 1).padStart(2, '0')}</span><input maxLength={40} value={word} onChange={(event) => updateTemplate('charadesWords', templateContent.charadesWords.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="例如：手捧花" /><button type="button" aria-label={`删除第 ${index + 1} 个比划词`} onClick={() => updateTemplate('charadesWords', templateContent.charadesWords.filter((_, itemIndex) => itemIndex !== index))}>删除</button></label>
                ))}</div> : <div className={styles.quizBuilderEmpty}>还没有你比划我猜词语；可以添加自己的词库。</div>}
              </section>
            </div>
          ) : <div className={styles.moduleBankDisabled}>当前方案没有选择“组队游戏”，因此团队游戏题库不会进入交付。返回方案定制器选中该模块后即可编辑。</div>}
        </fieldset>

        <fieldset className={styles.contentSection}>
          <legend><span>06</span><div><small>MISSION COPY</small><strong>定制安全开放的任务文案</strong></div></legend>
          {draft.modules.includes('secret-missions') ? <>
            <div className={styles.missionCopyBoundary}><strong>只改宾客可见文案，不改游戏规则</strong><p>以下 10 项普通或仪式任务可以修改标题和说明。任务编号、阶段、积分、人数、分配方式、核验方法和系统结算保持锁定；爱心/星星抉择、恶作剧者、能力卡等机制任务不可在这里修改。</p></div>
            <div className={styles.missionCopyList}>{PLATFORM_EDITABLE_MISSIONS.map((mission) => {
              const override = templateContent.missionCopyOverrides.find((item) => item.missionCode === mission.missionCode);
              return <article key={mission.missionCode} className={override ? styles.missionCopyActive : styles.missionCopyCard}>
                <header><div><small>{mission.stage === 'task_round_1' ? '第一幕' : '第二幕'} · {mission.missionCode}</small><strong>{override?.title || mission.title}</strong></div><button type="button" aria-pressed={Boolean(override)} onClick={() => toggleMissionCopy(mission.missionCode)}>{override ? '恢复模板文案' : '定制这项文案'}</button></header>
                <div className={styles.missionCopyLocked}><span>积分锁定：{mission.points} 分</span><span>核验锁定：{mission.verificationMethod}</span></div>
                {override ? <div className={styles.missionCopyFields}>
                  <label>宾客可见标题<input maxLength={60} value={override.title} onChange={(event) => updateMissionCopy(mission.missionCode, 'title', event.target.value)} /><small>{override.title.length}/60</small></label>
                  <label>宾客可见任务说明<textarea maxLength={500} value={override.description} onChange={(event) => updateMissionCopy(mission.missionCode, 'description', event.target.value)} /><small>{override.description.length}/500</small></label>
                </div> : <p className={styles.missionCopyDefault}>{mission.description}</p>}
              </article>;
            })}</div>
          </> : <div className={styles.moduleBankDisabled}>当前方案没有选择“秘密任务”，任务文案不会进入交付。返回方案定制器启用该模块后即可编辑。</div>}
        </fieldset>

        <section className={styles.contentNext}>
          <div><p className={styles.eyebrow}>NEXT STEP</p><h2>{brief.boundariesConfirmed ? '内容方向已经可以进入项目保存。' : '保存前，请先确认内容边界。'}</h2><p>登录不会自动上传问卷；只有你在账号页明确点击保存，资料才会进入独立客户项目。</p></div>
          <div><Link className={styles.primaryAction} href="/platform/preview">查看体验预览 <span>→</span></Link><Link className={styles.secondaryAction} href="/platform/account">前往账号与保存</Link><Link className={styles.secondaryAction} href="/platform/create">返回方案定制</Link></div>
        </section>
      </form>
    </div>
  );
}
