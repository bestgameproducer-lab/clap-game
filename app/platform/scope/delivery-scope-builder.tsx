'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  PLATFORM_CUSTOMIZATION_LEVELS,
  PLATFORM_PLANS,
  PLATFORM_REHEARSAL_MODES,
  PLATFORM_SERVICES,
  PLATFORM_SUPPORT_MODES,
  type PlatformServiceId,
} from '../../../lib/platform/catalog';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  ensureWeddingDraftId,
  getWeddingCoupleName,
  getWeddingDeliveryScope,
  isWeddingDraft,
  type PlatformDeliveryScope,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import {
  PLATFORM_RETENTION_WINDOWS,
  getPlatformRetentionDays,
  isPlatformDataPolicyReady,
  normalizePlatformDataPolicy,
  type PlatformDataPolicy,
} from '../../../lib/platform/data-policy';
import styles from '../platform.module.css';

export function DeliveryScopeBuilder() {
  const [draft, setDraft] = useState<WeddingDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('正在读取本机草稿…');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isWeddingDraft(parsed)) return;
      setDraft(ensureWeddingDraftId(parsed));
      setMessage('服务范围已与这台设备上的方案同步');
    } catch {
      setMessage('本机草稿读取失败，请返回定制器重新保存');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || !draft) return;
    try {
      window.localStorage.setItem(PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setMessage('服务范围已自动保存在这台设备');
    } catch {
      setMessage('浏览器不允许保存，请勿关闭页面并记录当前选择');
    }
  }, [draft, ready]);

  const scope = draft ? getWeddingDeliveryScope(draft) : null;
  const dataPolicy = draft ? normalizePlatformDataPolicy(draft.dataPolicy) : null;
  const selectedServices = useMemo(() => (
    scope ? PLATFORM_SERVICES.filter((service) => scope.services.includes(service.id)) : []
  ), [scope]);

  function updateScope<K extends keyof PlatformDeliveryScope>(key: K, value: PlatformDeliveryScope[K]) {
    setDraft((current) => current ? {
      ...current,
      deliveryScope: { ...getWeddingDeliveryScope(current), [key]: value },
    } : current);
  }

  function toggleService(serviceId: PlatformServiceId) {
    if (!scope) return;
    updateScope('services', scope.services.includes(serviceId)
      ? scope.services.filter((id) => id !== serviceId)
      : [...scope.services, serviceId]);
  }

  function updateDataPolicy<K extends keyof PlatformDataPolicy>(key: K, value: PlatformDataPolicy[K]) {
    setDraft((current) => current ? {
      ...current,
      dataPolicy: { ...normalizePlatformDataPolicy(current.dataPolicy), [key]: value },
    } : current);
  }

  if (!ready) return <section className={styles.scopeLoading} aria-live="polite">正在读取这台设备上的服务范围…</section>;
  if (!draft || !scope || !dataPolicy) {
    return (
      <section className={styles.scopeEmpty}>
        <p className={styles.eyebrow}>NO LOCAL PROJECT YET</p>
        <h1>先创建婚礼方案，再确认服务范围。</h1>
        <p>这个页面只处理本机草稿，不会创建订单、扣款或云端资源。</p>
        <Link className={styles.primaryAction} href="/platform/create">创建婚礼方案 <span>→</span></Link>
      </section>
    );
  }

  const chosenPlan = PLATFORM_PLANS.find((plan) => plan.id === draft.plan) ?? PLATFORM_PLANS[0];
  const customization = PLATFORM_CUSTOMIZATION_LEVELS.find((item) => item.id === scope.customizationLevel)!;
  const support = PLATFORM_SUPPORT_MODES.find((item) => item.id === scope.supportMode)!;
  const rehearsal = PLATFORM_REHEARSAL_MODES.find((item) => item.id === scope.rehearsalMode)!;
  const pendingDataConfirmations = Number(!dataPolicy.rosterAuthorityConfirmed) + Number(!dataPolicy.guestNoticeConfirmed);

  return (
    <div className={styles.scopeLayout}>
      <section className={styles.scopeHero}>
        <div><p className={styles.eyebrow}>COMMERCIAL SCOPE · NO PAYMENT</p><h1>先确认要买什么，<br />再讨论价格与合同。</h1><p>{getWeddingCoupleName(draft)} 的服务范围会进入项目版本和审核记录，但当前不会收费或自动开通资源。</p></div>
        <div className={styles.scopeStatus} aria-live="polite"><span /><div><strong>本机服务范围</strong><small>{message}</small></div></div>
      </section>

      <div className={styles.scopeGrid}>
        <form className={styles.scopeForm} onSubmit={(event) => event.preventDefault()}>
          <fieldset className={styles.scopeSection}>
            <legend><small>01 · COMMERCIAL MODEL</small><strong>交付模式</strong></legend>
            <div className={styles.scopeOptionGrid}>{PLATFORM_PLANS.map((plan) => <button key={plan.id} type="button" aria-pressed={draft.plan === plan.id} className={draft.plan === plan.id ? styles.scopeOptionSelected : styles.scopeOption} onClick={() => setDraft({ ...draft, plan: plan.id })}><small>{plan.eyebrow}</small><strong>{plan.name}</strong><p>{plan.summary}</p></button>)}</div>
          </fieldset>

          <fieldset className={styles.scopeSection}>
            <legend><small>02 · CUSTOMIZATION</small><strong>定制深度</strong></legend>
            <div className={styles.scopeOptionGrid}>{PLATFORM_CUSTOMIZATION_LEVELS.map((item) => <button key={item.id} type="button" aria-pressed={scope.customizationLevel === item.id} className={scope.customizationLevel === item.id ? styles.scopeOptionSelected : styles.scopeOption} onClick={() => updateScope('customizationLevel', item.id)}><strong>{item.name}</strong><p>{item.description}</p></button>)}</div>
          </fieldset>

          <fieldset className={styles.scopeSection}>
            <legend><small>03 · OPERATIONS</small><strong>运营协作方式</strong></legend>
            <div className={styles.scopeOptionGrid}>{PLATFORM_SUPPORT_MODES.map((item) => <button key={item.id} type="button" aria-pressed={scope.supportMode === item.id} className={scope.supportMode === item.id ? styles.scopeOptionSelected : styles.scopeOption} onClick={() => updateScope('supportMode', item.id)}><strong>{item.name}</strong><p>{item.description}</p></button>)}</div>
          </fieldset>

          <fieldset className={styles.scopeSection}>
            <legend><small>04 · REHEARSAL</small><strong>彩排方式</strong></legend>
            <div className={styles.scopeOptionGrid}>{PLATFORM_REHEARSAL_MODES.map((item) => <button key={item.id} type="button" aria-pressed={scope.rehearsalMode === item.id} className={scope.rehearsalMode === item.id ? styles.scopeOptionSelected : styles.scopeOption} onClick={() => updateScope('rehearsalMode', item.id)}><strong>{item.name}</strong><p>{item.description}</p></button>)}</div>
          </fieldset>

          <fieldset className={styles.scopeSection}>
            <legend><small>05 · SERVICE ITEMS</small><strong>服务项目</strong></legend>
            <div className={styles.scopeServiceGrid}>{PLATFORM_SERVICES.map((service) => <label key={service.id} className={scope.services.includes(service.id) ? styles.scopeServiceSelected : styles.scopeService}><input type="checkbox" checked={scope.services.includes(service.id)} onChange={() => toggleService(service.id)} /><span><strong>{service.name}</strong><p>{service.description}</p>{service.availability === 'needs-confirmation' ? <small>需人工确认档期与服务能力</small> : null}</span><b aria-hidden="true">{scope.services.includes(service.id) ? '✓' : '+'}</b></label>)}</div>
            {selectedServices.length === 0 ? <p className={styles.builderWarning}>至少选择一项服务，才能形成有效的交付范围。</p> : null}
            <label className={styles.scopeNotes}>补充要求或档期备注<textarea maxLength={1000} value={scope.serviceNotes} onChange={(event) => updateScope('serviceNotes', event.target.value)} placeholder="例如：策划团队在新加坡，需要中英双语远程彩排；婚礼日支持时区为巴厘岛。" /></label>
          </fieldset>

          <fieldset className={styles.scopeSection}>
            <legend><small>06 · DATA LIFECYCLE</small><strong>宾客资料生命周期</strong></legend>
            <p className={styles.scopeSectionIntro}>这里约定未来独立婚礼实例中的名单、头像、积分与任务记录保留多久。平台不提供无限期保留；项目草稿与宾客运行资料始终分开。</p>
            <div className={styles.scopeOptionGrid}>{PLATFORM_RETENTION_WINDOWS.map((option) => <button key={option.id} type="button" aria-pressed={dataPolicy.retentionWindow === option.id} className={dataPolicy.retentionWindow === option.id ? styles.scopeOptionSelected : styles.scopeOption} onClick={() => updateDataPolicy('retentionWindow', option.id)}><small>{option.days} DAYS</small><strong>{option.name}</strong><p>{option.description}</p></button>)}</div>
            <div className={styles.dataPolicyConfirmations}>
              <label className={dataPolicy.rosterAuthorityConfirmed ? styles.dataPolicyConfirmed : styles.dataPolicyConfirmation}><input type="checkbox" checked={dataPolicy.rosterAuthorityConfirmed} onChange={(event) => updateDataPolicy('rosterAuthorityConfirmed', event.target.checked)} /><span><strong>我确认有权向平台提供这场婚礼的宾客基础名单</strong><p>只提供运行所需的显示姓名与登录名；不要填写密码、身份证、健康信息或其他无关资料。</p></span><b aria-hidden="true">{dataPolicy.rosterAuthorityConfirmed ? '✓' : '!'}</b></label>
              <label className={dataPolicy.guestNoticeConfirmed ? styles.dataPolicyConfirmed : styles.dataPolicyConfirmation}><input type="checkbox" checked={dataPolicy.guestNoticeConfirmed} onChange={(event) => updateDataPolicy('guestNoticeConfirmed', event.target.checked)} /><span><strong>我确认会在名单导入前向宾客说明游戏会处理哪些资料</strong><p>本项是项目交付前的操作确认，不替代适用于你们婚礼所在地的法律意见。</p></span><b aria-hidden="true">{dataPolicy.guestNoticeConfirmed ? '✓' : '!'}</b></label>
              <label className={dataPolicy.projectArchiveBeforeDeletion ? styles.dataPolicyConfirmed : styles.dataPolicyConfirmation}><input type="checkbox" checked={dataPolicy.projectArchiveBeforeDeletion} onChange={(event) => updateDataPolicy('projectArchiveBeforeDeletion', event.target.checked)} /><span><strong>删除前导出不含宾客运行资料的项目配置归档</strong><p>归档只包含已确认的方案与内容配置，不包含宾客账号、头像、积分、任务记录或密钥。</p></span><b aria-hidden="true">{dataPolicy.projectArchiveBeforeDeletion ? '✓' : '—'}</b></label>
            </div>
            <div className={styles.dataPolicyIsolation}><span>LOCKED SAFEGUARD</span><strong>每个客户项目必须交付到独立隔离实例</strong><p>此项不可关闭。名单不会进入平台草稿、其他客户项目或现有婚礼运行数据库。</p></div>
          </fieldset>
        </form>

        <aside className={styles.scopeSummary}>
          <p className={styles.eyebrow}>QUOTE-READY SCOPE</p>
          <h2>{chosenPlan.name}</h2>
          <p>{chosenPlan.bestFor}</p>
          <dl><div><dt>定制深度</dt><dd>{customization.name}</dd></div><div><dt>运营方式</dt><dd>{support.name}</dd></div><div><dt>彩排方式</dt><dd>{rehearsal.name}</dd></div><div><dt>服务项目</dt><dd>{selectedServices.length} 项</dd></div><div><dt>宾客资料</dt><dd>婚礼后 {getPlatformRetentionDays(dataPolicy)} 天删除</dd></div></dl>
          <ol>{selectedServices.map((service) => <li key={service.id}><span>✓</span><div><strong>{service.name}</strong>{service.availability === 'needs-confirmation' ? <small>待确认</small> : null}</div></li>)}</ol>
          <div className={styles.scopeCommercialNotice}><strong>当前不是订单</strong><p>这里不显示未经确认的价格，不扣款，也不代表平台已经接受婚礼日服务档期。价格、税费、退款、服务时段和数据保留需要在正式报价中确认。</p></div>
          <div className={isPlatformDataPolicyReady(dataPolicy) ? styles.dataPolicySummaryReady : styles.dataPolicySummaryPending}><strong>{isPlatformDataPolicyReady(dataPolicy) ? '资料责任已确认' : `还有 ${pendingDataConfirmations} 项资料责任待确认`}</strong><p>{isPlatformDataPolicyReady(dataPolicy) ? '保存到云端后，这份约定会进入不可变版本、运营审核和实例配置清单。' : '名单提供权限与宾客告知均确认后，项目才可以提交内容审核。'}</p></div>
          <div className={styles.scopeActions}><Link className={styles.primaryAction} href="/platform/account">连接账号并保存 <span>→</span></Link><Link className={styles.secondaryAction} href="/platform/project">查看项目准备度</Link></div>
        </aside>
      </div>
    </div>
  );
}
