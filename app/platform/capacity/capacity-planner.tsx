'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  ensureWeddingDraftId,
  getWeddingCoupleName,
  isWeddingDraft,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import {
  FLAGSHIP_PARTICIPATION_CONTRACT,
  buildPlatformCapacityPlan,
  buildPlatformSeatTemplateCsv,
} from '../../../lib/platform/capacity';
import styles from '../platform.module.css';

const SEAT_GROUPS = [
  { type: 'principal', eyebrow: 'PRINCIPALS', name: '新人账号', copy: '可以登录查看专属页面，但不进入秘密任务、投票或个人排名。' },
  { type: 'family_mission', eyebrow: 'FAMILY PLAYERS', name: '家人任务席位', copy: '参与第一幕普通或仪式任务，个人得分可进入排名，但不形成家人组团队分。' },
  { type: 'family_honor', eyebrow: 'HONOR GUESTS', name: '家人荣誉席位', copy: '领取家人组专属惊喜卡，不进入竞技团队与终局投票。' },
  { type: 'competitor', eyebrow: 'COMPETITIVE PLAYERS', name: '竞技玩家', copy: '两队各十人，参与秘密任务、团队游戏、终局投票和个人排名。' },
] as const;

export function CapacityPlanner() {
  const [draft, setDraft] = useState<WeddingDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('正在读取本机方案…');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isWeddingDraft(parsed)) return;
      setDraft(ensureWeddingDraftId(parsed));
      setMessage('已根据当前本机方案完成容量计算');
    } catch {
      setMessage('本机方案无法读取，请返回定制器重新确认');
    } finally {
      setReady(true);
    }
  }, []);

  const plan = useMemo(() => draft ? buildPlatformCapacityPlan(draft) : null, [draft]);

  function downloadSeatTemplate() {
    if (!draft || !plan?.seatTemplate.length) return;
    if (!plan.ready) {
      setMessage('请先填写两个不同的组名，再下载席位表');
      return;
    }
    try {
      const blob = new Blob([buildPlatformSeatTemplateCsv(draft)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '婚礼游戏宾客席位模板.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('空白席位表已下载；真实姓名仍只保存在你填写的文件中');
    } catch {
      setMessage('浏览器未允许下载，请稍后重试');
    }
  }

  if (!ready) return <section className={styles.capacityLoading} aria-live="polite">正在计算宾客容量…</section>;
  if (!draft || !plan) return <section className={styles.capacityEmpty}><p className={styles.eyebrow}>PROJECT REQUIRED</p><h1>先创建婚礼方案，再核对宾客容量。</h1><p>容量预检只读取当前设备上的方案，不会访问现有婚礼名单。</p><Link className={styles.primaryAction} href="/platform/create">创建婚礼方案 <span>→</span></Link></section>;

  return (
    <div className={styles.capacityLayout}>
      <section className={styles.capacityHero}>
        <div><p className={styles.eyebrow}>SEATS BEFORE NAMES</p><h1>先把每个席位留对，<br />再邀请真实宾客。</h1><p>{getWeddingCoupleName(draft)} · 这里检查的是玩法容量，不是正式名单导入。</p></div>
        <div className={styles.draftStatus} aria-live="polite"><span className={styles.statusReady} /><div><strong>本机容量预检</strong><small>{message}</small></div></div>
      </section>

      <section className={styles.capacityPrivacy}><strong>本页不收集宾客姓名</strong><p>平台当前只生成不含个人资料的空白席位结构。请不要把填写后的真实名单上传到内容问卷、故事备注或 GitHub；安全名单导入会在独立实例和保留期限确定后另行开放。</p></section>

      <section className={styles.capacityMetrics} aria-label="容量摘要">
        <article><small>WEDDING CAPACITY</small><strong>约 {plan.guestCapacity}</strong><span>婚礼总宾客档位</span></article>
        <article><small>APP ACCOUNTS</small><strong>{plan.appAccounts || '—'}</strong><span>{plan.secretMissionsEnabled ? '旗舰玩法登录席位' : '当前不要求'}</span></article>
        <article><small>AUDIENCE</small><strong>约 {plan.audienceOnlyCapacity}</strong><span>无需登录也可在场</span></article>
        <article><small>OPERATORS</small><strong>{plan.operatorSeats || '—'}</strong><span>{plan.operatorSeats ? '建议现场操作席位' : '未启用主持人台'}</span></article>
      </section>

      {plan.secretMissionsEnabled ? <>
        <section className={styles.capacitySection}>
          <header><div><p className={styles.eyebrow}>FLAGSHIP ACCOUNT GRAIN</p><h2>32 个账号不是 32 位全部宾客。</h2></div><p>这是经过真实婚礼验证的固定玩法结构：从更大的婚礼宾客中选择 32 位登录参与者，其余宾客仍可观看和参加主持人组织的公开环节。</p></header>
          <div className={styles.capacitySeatGrid}>{SEAT_GROUPS.map((group) => {
            const seats = plan.seatTemplate.filter((seat) => seat.seatType === group.type);
            return <article key={group.type}><small>{group.eyebrow}</small><strong>{seats.length} 席 · {group.name}</strong><p>{group.copy}</p><div>{seats.slice(0, 10).map((seat) => <span key={seat.seatId}>{seat.seatId}</span>)}</div></article>;
          })}</div>
        </section>

        <section className={styles.capacityTopology}>
          <div><p className={styles.eyebrow}>ROLE TOPOLOGY</p><h2>关系与隐藏身份由系统分配，不能写进客户表格。</h2><p>客户只需要确认谁占用哪个公开席位。爱心、星星、恶作剧者、双重裁决和幸运星会在独立实例中由服务端按模板规则生成，避免名单文件提前泄密。</p></div>
          <div className={styles.capacityTopologyFacts}>
            <article><strong>{FLAGSHIP_PARTICIPATION_CONTRACT.heartHolders}</strong><span>爱心持有者</span><small>2 对 + 1 位孤单丘比特</small></article>
            <article><strong>{FLAGSHIP_PARTICIPATION_CONTRACT.starHolders}</strong><span>星星持有者</span><small>2 对 + 1 位领航星</small></article>
            <article><strong>{FLAGSHIP_PARTICIPATION_CONTRACT.tricksters}</strong><span>恶作剧者</span><small>每支竞技队 1 人</small></article>
          </div>
        </section>
      </> : null}

      <section className={styles.capacitySection}>
        <header><div><p className={styles.eyebrow}>PREFLIGHT RESULT</p><h2>{plan.secretMissionsEnabled ? plan.ready ? '当前人数档位与旗舰玩法结构兼容。' : '还有一项容量配置需要修正。' : '当前方案不需要秘密角色容量。'}</h2></div><span className={plan.ready ? styles.capacityStatus : styles.capacityStatusBlocked}>{plan.secretMissionsEnabled ? plan.ready ? '结构可行' : '暂不可用' : '无需检查'}</span></header>
        <div className={styles.capacityChecks}>{plan.checks.map((check) => <article key={check.id} className={check.status === 'blocked' ? styles.capacityCheckBlocked : undefined}><b>{check.status === 'ready' ? '✓' : check.status === 'blocked' ? '!' : '—'}</b><div><strong>{check.label}</strong><p>{check.detail}</p></div></article>)}</div>
      </section>

      <section className={styles.capacityNext}>
        <div><small>NEXT SAFE STEP</small><h2>{plan.secretMissionsEnabled ? '下载空白席位表，在线下填写名单。' : '返回模块配置，或继续完成内容定制。'}</h2><p>{plan.secretMissionsEnabled ? 'CSV 由浏览器本地生成，团队名称会使用当前方案设置；文件不会自动上传。它目前是筹备材料，不是可以直接导入正式婚礼的执行指令。' : '如果之后重新启用秘密任务，本页会恢复固定的 32 席预检。'}</p></div>
        <div>{plan.secretMissionsEnabled ? <button type="button" onClick={downloadSeatTemplate} disabled={!plan.ready}>下载空白席位 CSV</button> : null}<Link href="/platform/content">继续内容定制</Link><Link href="/platform/project">返回项目工作台</Link></div>
      </section>
    </div>
  );
}
