'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  FLAGSHIP_TEMPLATE,
  PLATFORM_MODULES,
  PLATFORM_PLANS,
  PLATFORM_THEMES,
  PLATFORM_TONES,
  type PlatformModuleId,
  type PlatformPlanId,
} from '../../../lib/platform/catalog';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  buildWeddingBrief,
  createDefaultDraft,
  ensureWeddingDraftId,
  formatWeddingDate,
  getWeddingCoupleName,
  isWeddingDraft,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import styles from '../platform.module.css';

export function WeddingBuilder({ initialPlan }: { initialPlan?: PlatformPlanId }) {
  const [draft, setDraft] = useState<WeddingDraft>(() => createDefaultDraft(initialPlan));
  const [ready, setReady] = useState(false);
  const [saveMessage, setSaveMessage] = useState('正在读取本机草稿…');

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const parsed: unknown = JSON.parse(rawDraft);
        if (isWeddingDraft(parsed)) {
          const restored = ensureWeddingDraftId(parsed);
          setDraft(initialPlan ? { ...restored, plan: initialPlan } : restored);
          setSaveMessage('已恢复这台设备上的草稿');
        } else {
          setSaveMessage('旧草稿格式已失效，已使用安全默认方案');
        }
      } else {
        setSaveMessage('新方案已准备好');
      }
    } catch {
      setSaveMessage('草稿读取失败，已使用安全默认方案');
    } finally {
      setReady(true);
    }
  }, [initialPlan]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setSaveMessage('草稿已自动保存在这台设备');
    } catch {
      setSaveMessage('浏览器未允许保存草稿，请在离开前复制方案摘要');
    }
  }, [draft, ready]);

  const selectedTheme = PLATFORM_THEMES.find((theme) => theme.id === draft.theme) ?? PLATFORM_THEMES[0];
  const selectedTone = PLATFORM_TONES.find((tone) => tone.id === draft.tone) ?? PLATFORM_TONES[0];
  const selectedPlan = PLATFORM_PLANS.find((plan) => plan.id === draft.plan) ?? PLATFORM_PLANS[0];
  const selectedModules = PLATFORM_MODULES.filter((module) => draft.modules.includes(module.id));
  const coupleName = getWeddingCoupleName(draft);

  const projectFacts = useMemo(() => {
    const guestCount = Number(draft.guestCount);
    return {
      operatorSeats: guestCount >= 120 ? 4 : guestCount >= 80 ? 3 : 2,
      rehearsalRounds: draft.plan === 'subscription' ? 3 : 2,
      setupDays: 8 + selectedModules.length * 2 + (guestCount >= 120 ? 3 : 0),
    };
  }, [draft.guestCount, draft.plan, selectedModules.length]);

  function update<K extends keyof WeddingDraft>(key: K, value: WeddingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleModule(moduleId: PlatformModuleId) {
    setDraft((current) => ({
      ...current,
      modules: current.modules.includes(moduleId)
        ? current.modules.filter((id) => id !== moduleId)
        : [...current.modules, moduleId],
    }));
  }

  function buildSummary() {
    return buildWeddingBrief(draft);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildSummary());
      setSaveMessage('方案摘要已复制');
    } catch {
      setSaveMessage('浏览器未允许复制，请手动记录当前方案');
    }
  }

  function downloadBrief() {
    try {
      const blob = new Blob([`\uFEFF${buildSummary()}`], { type: 'text/plain;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeName = coupleName.replace(/[\\/:*?"<>|]+/g, '-');
      anchor.href = downloadUrl;
      anchor.download = `婚礼游戏需求单-${safeName}.txt`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      setSaveMessage('需求单已下载到这台设备');
    } catch {
      setSaveMessage('浏览器未允许下载，请改用复制方案摘要');
    }
  }

  function resetDraft() {
    const freshDraft = createDefaultDraft(initialPlan);
    window.localStorage.removeItem(PLATFORM_DRAFT_STORAGE_KEY);
    setDraft(freshDraft);
    setSaveMessage('已清空本机草稿');
  }

  const themeClass = {
    estate: styles.builderPreviewEstate,
    garden: styles.builderPreviewGarden,
    night: styles.builderPreviewNight,
  }[draft.theme];

  return (
    <div className={styles.builderLayout}>
      <section className={styles.builderIntro}>
        <p className={styles.eyebrow}>BUILD YOUR WEDDING WORLD</p>
        <h1>先做第一版，<br />再一起把细节变成你们。</h1>
        <p>这里选择的是产品方向，不是最终合同。所有内容都可以在正式制作阶段继续调整。</p>
        <div className={styles.draftStatus} aria-live="polite">
          <span className={ready ? styles.statusReady : styles.statusLoading} />
          <div><strong>设备草稿</strong><small>{saveMessage}</small></div>
        </div>
      </section>

      <div className={styles.builderWorkspace}>
        <form className={styles.builderForm} onSubmit={(event) => event.preventDefault()}>
          <fieldset className={styles.builderSection}>
            <legend><span>01</span><div><small>THE COUPLE</small><strong>先写下这场婚礼是谁的</strong></div></legend>
            <div className={styles.twoFields}>
              <label>一位新人的名字<input value={draft.partnerOne} onChange={(event) => update('partnerOne', event.target.value)} placeholder="例如 Zimin" /></label>
              <label>另一位新人的名字<input value={draft.partnerTwo} onChange={(event) => update('partnerTwo', event.target.value)} placeholder="例如 Anrong" /></label>
            </div>
            <div className={styles.twoFields}>
              <label>婚礼日期<input type="date" value={draft.weddingDate} onChange={(event) => update('weddingDate', event.target.value)} /></label>
              <label>地点<input value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="城市、酒店或场地" /></label>
            </div>
            <label>宾客规模<select value={draft.guestCount} onChange={(event) => update('guestCount', event.target.value as WeddingDraft['guestCount'])}>
              <option value="40">约 40 人 · 亲密小型</option>
              <option value="80">约 80 人 · 标准婚礼</option>
              <option value="120">约 120 人 · 大型晚宴</option>
              <option value="180">约 180 人 · 多区协作</option>
            </select></label>
          </fieldset>

          <fieldset className={styles.builderSection}>
            <legend><span>02</span><div><small>ART DIRECTION</small><strong>选择世界观与情绪</strong></div></legend>
            <div className={styles.choiceGrid}>
              {PLATFORM_THEMES.map((theme) => (
                <button key={theme.id} className={draft.theme === theme.id ? styles.choiceSelected : styles.choiceCard} type="button" aria-pressed={draft.theme === theme.id} onClick={() => update('theme', theme.id)}>
                  <i className={styles.palette} aria-hidden="true">{theme.palette.map((color) => <b key={color} style={{ backgroundColor: color }} />)}</i>
                  <strong>{theme.name}</strong><small>{theme.description}</small>
                </button>
              ))}
            </div>
            <div className={styles.choiceGrid}>
              {PLATFORM_TONES.map((tone) => (
                <button key={tone.id} className={draft.tone === tone.id ? styles.choiceSelected : styles.choiceCard} type="button" aria-pressed={draft.tone === tone.id} onClick={() => update('tone', tone.id)}>
                  <strong>{tone.name}</strong><small>{tone.description}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.builderSection}>
            <legend><span>03</span><div><small>GAME MODULES</small><strong>组合你们需要的游戏模块</strong></div></legend>
            <div className={styles.moduleChoices}>
              {PLATFORM_MODULES.map((module) => (
                <label key={module.id} className={draft.modules.includes(module.id) ? styles.moduleSelected : styles.moduleChoice}>
                  <input type="checkbox" checked={draft.modules.includes(module.id)} onChange={() => toggleModule(module.id)} />
                  <span><small>{module.stage}</small><strong>{module.name}</strong><p>{module.description}</p></span>
                  <b aria-hidden="true">{draft.modules.includes(module.id) ? '✓' : '+'}</b>
                </label>
              ))}
            </div>
            {selectedModules.length === 0 ? <p className={styles.builderWarning}>至少选择一个模块，方案才可以进入制作。</p> : null}
          </fieldset>

          <fieldset className={styles.builderSection}>
            <legend><span>04</span><div><small>DELIVERY MODEL</small><strong>选择交付与运营方式</strong></div></legend>
            <div className={styles.planChoices}>
              {PLATFORM_PLANS.map((plan) => (
                <button key={plan.id} className={draft.plan === plan.id ? styles.planSelected : styles.planChoice} type="button" aria-pressed={draft.plan === plan.id} onClick={() => update('plan', plan.id)}>
                  <small>{plan.eyebrow}</small><strong>{plan.name}</strong><p>{plan.summary}</p><b>{plan.bestFor}</b>
                </button>
              ))}
            </div>
            <label>关于你们故事的第一条备注<textarea value={draft.storyNote} onChange={(event) => update('storyNote', event.target.value)} placeholder="例如：我们在潜水旅行中认识，希望游戏里有海洋、猫和共同朋友的故事。" /></label>
          </fieldset>

          <div className={styles.builderActions}>
            <button className={styles.copyAction} type="button" onClick={copySummary}>复制方案摘要</button>
            <button className={styles.downloadAction} type="button" onClick={downloadBrief}>下载需求单</button>
            <Link className={styles.workspaceAction} href="/platform/content">填写内容问卷</Link>
            <Link className={styles.workspaceAction} href="/platform/project">查看项目工作台</Link>
            <button className={styles.resetAction} type="button" onClick={resetDraft}>清空并重新开始</button>
          </div>
          <p className={styles.builderPrivacy}>填写和登录都不会自动上传姓名、日期或故事；只有在账号页明确点击保存后，资料才会进入独立客户项目。</p>
        </form>

        <aside className={styles.builderPreviewColumn}>
          <div className={`${styles.builderPreview} ${themeClass}`}>
            <div className={styles.previewTopline}><span>{FLAGSHIP_TEMPLATE.name}</span><b>方案实时预览</b></div>
            <div className={styles.builderPreviewHero}>
              <small>A WEDDING WORLD FOR</small>
              <h2>{coupleName}</h2>
              <p>{formatWeddingDate(draft.weddingDate)} · {draft.location.trim() || '地点待定'}</p>
            </div>
            <div className={styles.builderPreviewMeta}>
              <div><small>GUESTS</small><strong>约 {draft.guestCount} 人</strong></div>
              <div><small>STORY</small><strong>{selectedTone.name}</strong></div>
              <div><small>PLAN</small><strong>{selectedPlan.name}</strong></div>
            </div>
            <div className={styles.builderPreviewModules}>
              <div><small>SELECTED EXPERIENCE</small><strong>{selectedModules.length} 个游戏模块</strong></div>
              {selectedModules.length ? selectedModules.map((module, index) => (
                <article key={module.id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{module.shortName}</strong><small>{module.stage}</small></article>
              )) : <p>请从左侧至少选择一个游戏模块。</p>}
            </div>
          </div>

          <div className={styles.projectEstimate}>
            <p className={styles.eyebrow}>FIRST-PASS DELIVERY MAP</p>
            <h3>这版方案预计需要</h3>
            <div>
              <article><strong>{projectFacts.setupDays}</strong><span>个工作日完成首版</span></article>
              <article><strong>{projectFacts.rehearsalRounds}</strong><span>轮完整流程彩排</span></article>
              <article><strong>{projectFacts.operatorSeats}</strong><span>个现场工作人员席位</span></article>
            </div>
            <p>这是产品规划参考，不是价格或交付承诺。正式项目会根据内容复杂度重新确认。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
