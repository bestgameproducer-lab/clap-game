'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { compressTaskEvidence } from '@/lib/client-image';
import { isTaskActionOpenAtStage } from '@/lib/game-rules';

const GUEST_CACHE_KEY = 'wedding-guest-session-cache-v1';

type RegistrationGuest = { id: string; name: string; loginName: string; hasPassword: boolean };
type SecretCard = { team: string; role: string; storyRole: string; task: { id: string; title: string; description: string; verificationMethod: string; points: number }; drawnAt: string };
type GuestData = {
  guest: { id: string; name: string; team: string; role: string; is_hidden_spy: boolean; points: number; drawn_at: string | null; special_card_revealed_at: string | null; participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL'; relationship: string; story_role: string; eligible_for_mission: boolean; eligible_for_secret_role: boolean; eligible_for_personal_score: boolean; special_card_title: string; special_card_body: string };
  assignments: Array<{ id: string; status: string; is_initial: boolean; completion_rank: number | null; early_bonus_points: number; reward_task_id: string | null; reward_clue_id: string | null; completion_note: string; verification_note: string; verified_at: string | null; evidence_uploaded_at: string | null; evidence_url: string | null; rejection_reason: string | null; task: { title: string; description: string; verification_method: string; points: number; category: string; stage: string } }>;
  clues: Array<{ id: string; title: string; content: string }>;
  game: { registration_open: boolean; stage: string; voting_open: boolean; voting_round: number; results_visible: boolean; scoreboard_visible: boolean; phase_note: string | null; task_catalog_mode: 'demo' | 'live' } | null;
  candidates: Array<{ id: string; name: string; team: string }>;
  existingVote: string | null;
  results: null | {
    teamMembers: Array<{ id: string; name: string; role: string; is_hidden_spy: boolean }>;
    votedTargetId: string | null;
    votedTargetName: string | null;
    voteCorrect: boolean | null;
    bonusPoints: number;
    spyPoints: number | null;
  };
};

const STAGES: Record<string, { label: string; note: string }> = {
  registration: { label: '宾客报到', note: '领取身份，准备进入丘比特的考验。' },
  waiting: { label: '等待开场', note: '和队友打个招呼，任务即将开始。' },
  task_round_1: { label: '秘密任务 · 第一轮', note: '悄悄完成任务，不要暴露你的卡片。' },
  task_round_2: { label: '升级任务 · 第二轮', note: '新的挑战已经开启。' },
  group_game: { label: '团队挑战', note: '与队友协作，也别忘了观察可疑行为。' },
  voting: { label: '最终投票', note: '选择本队最可疑的宾客。' },
  results: { label: '身份揭晓', note: '跟随主持人一起揭晓答案。' },
};

const STATUS_LABELS: Record<string, string> = {
  assigned: '进行中', submitted: '等待审核', approved: '已完成', rejected: '请补充验证',
};

const ROLE_LABELS: Record<string, { title: string; note: string }> = {
  spy: { title: '丘比特的恶作剧者（间谍）', note: '隐藏自己，完成你的秘密干扰任务。' },
  helper: { title: '丘比特的秘密信使', note: '暗中帮助队友，让线索自然流动。' },
  guest: { title: '丘比特的祝福见证者', note: '完成祝福任务，并留意身边的可疑行动。' },
};

const STORY_ROLE_LABELS: Record<string, { title: string; note: string }> = {
  OFFICIANT: { title: '誓词引导人', note: '在工作人员提示的环节，引导新人完成誓词。请在仪式开始前保守这个秘密。' },
  RING_KEEPER: { title: '戒指守护者', note: '在工作人员提示后领取戒指盒，并在交换戒指环节将它送到新人身边。' },
};

export default function GuestPage() {
  const [data, setData] = useState<GuestData | null>(null);
  const [checking, setChecking] = useState(true);
  const [invitationCode, setInvitationCode] = useState('');
  const [guests, setGuests] = useState<RegistrationGuest[] | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [selectedGuest, setSelectedGuest] = useState<RegistrationGuest | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimCodeConfirm, setClaimCodeConfirm] = useState('');
  const [search, setSearch] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [revealedCard, setRevealedCard] = useState<SecretCard | null>(null);
  const [specialCardRevealed, setSpecialCardRevealed] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setSyncing(true);
    try {
      const response = await fetch('/api/guest-me', { cache: 'no-store' });
      if (response.ok) {
        const nextData = await response.json();
        setData(nextData); setOffline(false); setError('');
        try {
          const offlineSnapshot = {
            ...nextData,
            assignments: nextData.assignments.map((assignment: GuestData['assignments'][number]) => ({ ...assignment, evidence_url: null })),
          };
          window.sessionStorage.setItem(GUEST_CACHE_KEY, JSON.stringify(offlineSnapshot));
        } catch {}
      }
      else if (response.status === 401) {
        setData(null);
        try { window.sessionStorage.removeItem(GUEST_CACHE_KEY); } catch {}
      }
      else setError('暂时无法加载游戏，请稍后重试。');
    } catch {
      setOffline(true); setError('网络连接不稳定，正在显示本机最近一次任务。');
      try {
        const cached = window.sessionStorage.getItem(GUEST_CACHE_KEY);
        if (cached) setData(JSON.parse(cached));
      } catch {}
    } finally { setChecking(false); setSyncing(false); }
  }, []);

  useEffect(() => {
    setOffline(!window.navigator.onLine);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && window.navigator.onLine) void load(true); }, 15_000);
    const handleOnline = () => { setOffline(false); void load(true); };
    const handleOffline = () => setOffline(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') setShowSecrets(false);
      else if (window.navigator.onLine) void load(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  useEffect(() => {
    if (!('serviceWorker' in window.navigator)) return;
    let active = true;
    let refreshing = false;
    const refreshForNewVersion = () => {
      if (!active || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    window.navigator.serviceWorker.addEventListener('controllerchange', refreshForNewVersion);
    window.navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        await registration.update();
        await window.navigator.serviceWorker.ready;
        if (active) setOfflineReady(true);
      })
      .catch(() => { if (active) setOfflineReady(false); });
    return () => {
      active = false;
      window.navigator.serviceWorker.removeEventListener('controllerchange', refreshForNewVersion);
    };
  }, []);

  async function unlockInvitation(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/registration/guests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '邀请码验证失败');
      setGuests(body.guests); setRegistrationOpen(body.registrationOpen !== false); setSearch('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '邀请码验证失败'); }
    finally { setBusy(false); }
  }

  async function claimIdentity(event: React.FormEvent) {
    event.preventDefault(); if (!selectedGuest) return;
    if (!selectedGuest.hasPassword && claimCode !== claimCodeConfirm) {
      setError('两次输入的四位密码不一致'); return;
    }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/registration/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationCode, loginName: selectedGuest.loginName, claimCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '身份认领失败');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '身份认领失败'); }
    finally { setBusy(false); }
  }

  async function submit(assignmentId: string, completionNote: string) {
    setMessage(''); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/submit-task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId, completionNote }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '提交失败'); return; }
      setMessage('任务已送到丘比特任务站，等待主办方确认。'); await load();
    } catch { setOffline(true); setError('当前处于离线状态，任务尚未提交，请联网后重试。'); }
    finally { setBusy(false); }
  }

  async function uploadEvidence(assignmentId: string, file: File) {
    setMessage(''); setError(''); setEvidenceBusyId(assignmentId);
    try {
      const image = await compressTaskEvidence(file);
      const authorization = await fetch('/api/task-evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const uploadInfo = await authorization.json();
      if (!authorization.ok) throw new Error(uploadInfo.error || '无法准备照片上传');
      const upload = await fetch(uploadInfo.signedUrl, {
        method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: image,
      });
      if (!upload.ok) throw new Error('照片上传失败，请检查网络后重试');
      const confirmation = await fetch('/api/task-evidence', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, path: uploadInfo.path }),
      });
      const confirmationBody = await confirmation.json();
      if (!confirmation.ok) throw new Error(confirmationBody.error || '照片确认失败，请重试');
      setMessage('验证照片已安全保存，只有你和工作人员可以查看。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '照片上传失败');
    } finally { setEvidenceBusyId(null); }
  }

  async function removeEvidence(assignmentId: string) {
    setMessage(''); setError(''); setEvidenceBusyId(assignmentId);
    try {
      const response = await fetch('/api/task-evidence', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '删除照片失败');
      setMessage('验证照片已删除。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除照片失败');
    } finally { setEvidenceBusyId(null); }
  }

  async function vote(targetGuestId: string) {
    if (!window.confirm('每位宾客本轮只能投一次，提交后不能修改。确认投给这位宾客吗？')) return;
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetGuestId }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '投票失败'); return; }
      setMessage('投票已提交并锁定。结果公布后会自动结算侦探积分。'); await load();
    } catch { setOffline(true); setError('当前处于离线状态，投票尚未保存，请联网后重试。'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/guest-logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout_failed');
    } catch {
      setOffline(true); setError('安全退出需要联网完成。请恢复网络后重试，当前身份仍保持登录。'); setBusy(false); return;
    }
    try { window.sessionStorage.removeItem(GUEST_CACHE_KEY); } catch {}
    setData(null); setInvitationCode(''); setGuests(null); setSelectedGuest(null); setClaimCode(''); setClaimCodeConfirm(''); setSearch(''); setShowSecrets(false); setRevealedCard(null); setSpecialCardRevealed(false);
    setBusy(false);
  }

  async function drawCard() {
    setDrawing(true); setError('');
    try {
      const [response] = await Promise.all([
        fetch('/api/draw-card', { method: 'POST' }),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '抽卡失败');
      setRevealedCard(body.card);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '抽卡失败，请重试'); }
    finally { setDrawing(false); }
  }

  async function enterMissionPage() {
    setRevealedCard(null);
    setShowSecrets(false);
    await load();
  }

  async function revealSpecialCard() {
    setDrawing(true); setError('');
    try {
      const [response] = await Promise.all([
        fetch('/api/reveal-special-card', { method: 'POST' }),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '惊喜卡暂时无法揭晓');
      setData((current) => current ? { ...current, guest: { ...current.guest, special_card_revealed_at: body.revealedAt } } : current);
      setSpecialCardRevealed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '惊喜卡暂时无法揭晓，请重试');
    } finally { setDrawing(false); }
  }

  const filteredGuests = useMemo(() => {
    if (!guests) return [];
    const term = search.trim().toLowerCase();
    return term ? guests.filter((guest) => `${guest.name} ${guest.loginName}`.toLowerCase().includes(term)) : guests;
  }, [guests, search]);

  if (checking) return <main className="welcome-shell"><section className="welcome-card"><div className="heart-mark">♡</div><h1>正在打开婚礼任务</h1><p>丘比特正在确认你的身份…</p></section></main>;

  if (!data) return <main className="welcome-shell">
    <section className={`welcome-card ${guests ? 'compact-registration' : ''}`}>
      <div className="eyebrow">ZIMIN &amp; ANRONG</div><div className="heart-mark">♡</div>
      <h1>丘比特的<br/>婚礼考验</h1>
      <p className="lead">从你来到婚礼现场的这一刻起，故事已经开始。</p>
      <div className="step-row"><span className={!guests ? 'active' : 'done'}>1</span><i/><span className={guests && !selectedGuest ? 'active' : selectedGuest ? 'done' : ''}>2</span><i/><span className={selectedGuest ? 'active' : ''}>3</span></div>
      {error && <div className="notice error">{error}</div>}
      {!guests && <form onSubmit={unlockInvitation}>
        <div className="step-copy"><strong>打开婚礼入口</strong><small>请输入请柬上的共享邀请码</small></div>
        <label htmlFor="invite-code">婚礼邀请码</label>
        <input id="invite-code" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="例如 LOVE2026" required/>
        <button disabled={busy}>{busy ? '验证中…' : '进入宾客名单'}</button>
      </form>}
      {guests && !selectedGuest && <div>
        <div className="step-copy"><strong>找到你的名字</strong><small>{registrationOpen ? '首次进入时，由你自己设置四位密码' : '新宾客注册已结束；已设置密码的宾客仍可登录'}</small></div>
        <label htmlFor="guest-search">搜索宾客</label>
        <input id="guest-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入中文、拼音或英文名"/>
        <div className="guest-list">{filteredGuests.map((guest) => <button type="button" className="guest-choice" key={guest.id} onClick={() => { setSelectedGuest(guest); setClaimCode(''); setClaimCodeConfirm(''); setError(''); }}><span><strong>{guest.name}</strong><small>{guest.loginName}</small></span><b>{guest.hasPassword ? '登录' : '首次设置'}</b></button>)}</div>
        <button className="text-button" onClick={() => { setGuests(null); setError(''); }}>返回修改邀请码</button>
      </div>}
      {selectedGuest && <form onSubmit={claimIdentity}>
        <div className="selected-identity"><small>{selectedGuest.hasPassword ? '欢迎回来' : '请确认你的身份'}</small><strong>{selectedGuest.name}</strong><span>{selectedGuest.loginName}</span></div>
        <div className="pin-heading"><strong>{selectedGuest.hasPassword ? '输入你的四位密码' : '设置你的四位密码'}</strong><small>{selectedGuest.hasPassword ? '这是你首次进入时自己设置的密码' : '只有你知道，用于以后再次登录'}</small></div>
        <label htmlFor="claim-code">四位数字密码</label>
        <input id="claim-code" className="claim-code-input" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete={selectedGuest.hasPassword ? 'current-password' : 'new-password'} value={claimCode} onChange={(event) => setClaimCode(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" required/>
        {!selectedGuest.hasPassword && <><label htmlFor="claim-code-confirm">再次输入密码</label><input id="claim-code-confirm" className="claim-code-input" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={claimCodeConfirm} onChange={(event) => setClaimCodeConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" required/></>}
        <p className="login-note">请记住这个密码。忘记后可联系主办方在后台重置。</p>
        <button disabled={busy || claimCode.length !== 4 || (!selectedGuest.hasPassword && claimCodeConfirm.length !== 4)}>{busy ? (selectedGuest.hasPassword ? '登录中…' : '设置中…') : (selectedGuest.hasPassword ? '登录我的身份' : '设置密码 · 开始抽卡')}</button>
        <button type="button" className="text-button" onClick={() => { setSelectedGuest(null); setError(''); }}>返回宾客名单</button>
      </form>}
    </section>
  </main>;

  if (data.guest.participation_mode === 'HONOR_GUEST' && (!data.guest.special_card_revealed_at || specialCardRevealed)) return <main className="draw-shell honor-draw-shell"><section className="draw-stage honor-draw-stage">
    <div className="eyebrow">A SURPRISE FOR FAMILY</div>
    <h1>{specialCardRevealed ? '这张卡，送给你' : `${data.guest.name}，准备好了吗？`}</h1>
    <p>{specialCardRevealed ? '谢谢你一路陪伴新人走到今天。请慢慢读完，这张卡不会自动消失。' : '丘比特为你准备了一张特别的惊喜卡。请点击卡片下方的按钮，亲自揭晓。'}</p>
    <div className={`secret-card-scene honor-surprise-scene ${drawing ? 'drawing' : ''} ${specialCardRevealed ? 'revealed' : ''}`}><div className="secret-card">
      <div className="secret-card-back"><span>♡</span><strong>CUPID&apos;S<br/>SECRET</strong><small>ZIMIN &amp; ANRONG</small></div>
      <div className="secret-card-front honor-surprise-front">
        <small>{data.guest.relationship || '家人'}</small>
        <div className="special-card-heart">♡</div>
        <h2>{data.guest.special_card_title || '家庭守护者'}</h2>
        <h3>{data.guest.name}</h3>
        <p>{data.guest.special_card_body || '你已经完成了最重要的任务：陪伴新人长大，并见证他们建立自己的家庭。'}</p>
        <div className="special-card-seal">ZIMIN &amp; ANRONG</div>
      </div>
    </div></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {!specialCardRevealed && <button className="draw-button" disabled={drawing} onClick={revealSpecialCard}>{drawing ? '丘比特正在洗牌…' : '抽取我的惊喜卡'}</button>}
    {specialCardRevealed && <button className="draw-button" onClick={() => { setSpecialCardRevealed(false); setShowSecrets(false); }}>我已读完 · 进入游戏主页</button>}
    <button className="text-button" disabled={busy || drawing} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>
    <p className="privacy-hint">惊喜卡看完后可进入游戏主页，参与现场互动并累积个人积分；不会收到秘密任务、间谍身份或隐藏线索。</p>
  </section></main>;

  if (data.guest.participation_mode === 'PRINCIPAL') return <main className="special-card-shell">
    <section className="special-guest-card principal">
      <div className="eyebrow">A PLACE JUST FOR YOU</div>
      <div className="special-card-heart">♡</div>
      <small>{data.guest.relationship || '特别宾客'}</small>
      <h1>{data.guest.special_card_title || '你的专属席位'}</h1>
      <h2>{data.guest.name}</h2>
      <p>{data.guest.special_card_body || '这是一张只属于你的卡片。'}</p>
      <div className="special-card-seal">ZIMIN &amp; ANRONG</div>
      <button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>
    </section>
  </main>;

  // A background refresh can observe drawn_at before the guest has finished reading.
  // Keep the reveal on screen until the guest explicitly dismisses it.
  if (!data.guest.drawn_at || revealedCard) {
    const drawOpen = Boolean(data.game?.registration_open);
    const role = revealedCard ? STORY_ROLE_LABELS[revealedCard.storyRole] ?? ROLE_LABELS[revealedCard.role] ?? ROLE_LABELS.guest : null;
    return <main className="draw-shell"><section className="draw-stage">
      <div className="eyebrow">YOUR SECRET AWAITS</div>
      <h1>{revealedCard ? '命运之卡已经揭晓' : `${data.guest.name}，准备好了吗？`}</h1>
      <p>{revealedCard ? '慢慢看完你的组别和身份，确认记住后再亲自收起卡片。' : '丘比特将同时为你抽取组别与秘密身份。每个人只有一次机会。'}</p>
      {error && <div className="notice error">{error}</div>}
      <div className={`secret-card-scene ${drawing ? 'drawing' : ''} ${revealedCard ? 'revealed' : ''}`}><div className="secret-card">
        <div className="secret-card-back"><span>♡</span><strong>CUPID&apos;S<br/>SECRET</strong><small>ZIMIN &amp; ANRONG</small></div>
        <div className="secret-card-front"><small>你被选中成为</small><h2>{role?.title}</h2><p>{role?.note}</p>
          <div className="card-team"><span>你的组别</span><strong>{revealedCard?.team}</strong></div>
          <div className="card-task"><span>{data.game?.task_catalog_mode === 'demo' ? '演示任务 · 之后会替换' : '第一项秘密任务'} · {revealedCard?.task.points} 分</span><strong>{revealedCard?.task.title}</strong><p>{revealedCard?.task.description}</p></div>
        </div>
      </div></div>
      {!revealedCard && <button className="draw-button" disabled={drawing || !drawOpen} onClick={drawCard}>{drawing ? '丘比特正在洗牌…' : drawOpen ? '抽取我的秘密卡' : '抽卡入口暂未开放'}</button>}
      {!revealedCard && !drawOpen && <div className="notice">主办方目前已关闭宾客抽卡，请联系现场工作人员协助。</div>}
      {revealedCard && <button className="draw-button" onClick={enterMissionPage}>我已经看清楚 · 收起卡片</button>}
      {!revealedCard && <button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>}
      <p className="privacy-hint">请遮挡屏幕。卡片不会自动消失，只有你点击上方按钮后才会隐藏。</p>
    </section></main>;
  }

  const stage = STAGES[data.game?.stage ?? 'registration'] ?? STAGES.registration;
  const isActivePlayer = data.guest.participation_mode === 'ACTIVE_PLAYER';
  const isHonorGuest = data.guest.participation_mode === 'HONOR_GUEST';
  const hasPublicIdentity = isHonorGuest || data.guest.story_role !== 'NONE' || Boolean(data.game?.results_visible);
  const identityVisible = hasPublicIdentity || showSecrets;
  const role = isHonorGuest
    ? { title: '家庭荣誉宾客', note: '参与现场互动并累积个人积分；不领取秘密任务、隐藏身份或间谍线索。' }
    : data.guest.story_role !== 'NONE' && STORY_ROLE_LABELS[data.guest.story_role]
    ? STORY_ROLE_LABELS[data.guest.story_role]
    : data.guest.is_hidden_spy
    ? { title: '丘比特的暗线（隐藏间谍）', note: '你的阵营已经改变。请继续伪装成普通宾客，直到最终揭晓。' }
    : ROLE_LABELS[data.guest.role] ?? ROLE_LABELS.guest;
  const rankedReward = data.assignments.find((assignment) => assignment.is_initial && assignment.completion_rank);
  return <main className="dashboard-shell">
    <section className="mission-hero">
      <div className="eyebrow">丘比特的婚礼考验</div>
      <div className="hero-line"><div><span className="team-chip">{isHonorGuest ? data.guest.relationship || '家人' : data.guest.team}</span><h1>{data.guest.name}</h1></div><div className="score-orb"><strong>{data.guest.points}</strong><small>积分</small></div></div>
      <div className={`identity-strip ${identityVisible ? 'visible' : 'concealed'}`}>
        <div className="identity-strip-heading"><small>{hasPublicIdentity ? '你的公开身份' : '你的秘密身份'}</small>{!hasPublicIdentity && <button type="button" aria-expanded={identityVisible} onClick={() => setShowSecrets((visible) => !visible)}>{identityVisible ? '隐藏身份' : '点击查看'}</button>}</div>
        {identityVisible ? <><strong>{role.title}</strong><p>{role.note}</p></> : <><strong className="identity-mask" aria-hidden="true">••••••</strong><p>身份已遮盖，需要时由本人点击查看。</p></>}
      </div>
      <div className="stage-card"><small>当前环节</small><strong>{stage.label}</strong><p>{data.game?.phase_note || stage.note}</p></div>
    </section>
    {(offline || syncing) && <div className={`connection-banner ${offline ? 'offline' : ''}`} role="status">{offline ? '离线只读模式 · 已显示最近同步的任务，提交和投票暂不可用' : '正在同步最新状态…'}</div>}
    {message && <div className="notice success" aria-live="polite">{message}</div>}{error && <div className="notice error" aria-live="polite">{error}</div>}
    {data.guest.is_hidden_spy && !data.game?.results_visible && identityVisible && <section className="reward-banner"><small>SECRET ROLE ACTIVATED</small><strong>你已成为隐藏间谍</strong><p>不要向其他宾客展示本页。继续完成任务并隐藏真实阵营，身份只会在最终揭晓后公开。</p></section>}
    {rankedReward && <section className="reward-banner"><small>EARLY COMPLETION HONOR</small><strong>你是第 {rankedReward.completion_rank} 位完成首轮任务的宾客</strong><p>{rankedReward.reward_task_id && rankedReward.reward_clue_id ? `升级任务、${rankedReward.early_bonus_points ? '额外 1 分和' : ''}一条秘密线索已经发放。` : rankedReward.reward_task_id ? '升级任务已经发放，将在第二轮开放。' : '你的首轮任务已经记录。'}</p></section>}
    {isHonorGuest && <section className="section-card honor-participation-card"><div className="section-heading"><div><small>FAMILY PARTICIPATION</small><h2>家人参与区</h2></div><span>♡</span></div><p>你可以和大家一起参加现场互动，获得的个人积分会显示在上方并进入个人积分榜。</p><div className="honor-boundary-note"><strong>轻松参与</strong><span>系统不会向你发放秘密任务、间谍身份或隐藏线索。</span></div></section>}
    {isActivePlayer && <section className="section-card"><div className="section-heading"><div><small>SECRET MISSIONS</small><h2>我的秘密任务</h2></div><span>{data.assignments.length}</span></div>
      {data.game?.task_catalog_mode === 'demo' && <div className="demo-task-note"><strong>当前是演示任务</strong><p>用于测试领取、提交和审核流程，不代表婚礼当天的最终任务设计。</p></div>}
      {data.assignments.length === 0 ? <div className="empty-state">本轮任务尚未开放，先享受婚礼吧。</div> : data.assignments.map((assignment, index) => <article className="mission-item" key={assignment.id}><div className="mission-number">{String(index + 1).padStart(2, '0')}</div><div className="mission-body"><div className="mission-meta"><span>{assignment.task.points} 分</span><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></div><h3>{assignment.task.title}</h3><p>{assignment.task.description}</p>{!isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && <div className="task-feedback">本环节已停止提交；如需补录，请到任务站联系工作人员。</div>}<div className="verification-note"><strong>如何验证</strong><span>{assignment.task.verification_method}</span></div>{assignment.evidence_url && <figure className="evidence-preview"><a href={assignment.evidence_url} target="_blank" rel="noreferrer"><img src={assignment.evidence_url} alt={`${assignment.task.title}的验证照片`} loading="lazy"/></a><figcaption>验证照片 · 仅你和工作人员可见</figcaption></figure>}{isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && <div className="evidence-controls"><label htmlFor={`evidence-${assignment.id}`}>{assignment.evidence_url ? '更换验证照片' : '添加验证照片（选填）'}</label><input id={`evidence-${assignment.id}`} type="file" accept="image/*" disabled={offline || evidenceBusyId === assignment.id} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadEvidence(assignment.id, file); }}/>{assignment.evidence_url && <button type="button" className="text-button" disabled={offline || evidenceBusyId === assignment.id} onClick={() => { if (window.confirm('删除这张验证照片？')) void removeEvidence(assignment.id); }}>删除照片</button>}{evidenceBusyId === assignment.id && <small>正在压缩并安全上传…</small>}</div>}{assignment.completion_note && <div className="submission-note"><strong>我的完成说明</strong><span>{assignment.completion_note}</span></div>}{assignment.status === 'approved' && assignment.verification_note && <div className="submission-note approved"><strong>任务站核验记录</strong><span>{assignment.verification_note}</span></div>}{assignment.status === 'rejected' && <div className="task-feedback">任务站留言：{assignment.rejection_reason || '请补充验证后再次提交。'}</div>}{isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && <div className="submission-form"><label htmlFor={`completion-note-${assignment.id}`}>完成说明（选填）</label><textarea id={`completion-note-${assignment.id}`} value={completionNotes[assignment.id] ?? assignment.completion_note ?? ''} onChange={(event) => setCompletionNotes({ ...completionNotes, [assignment.id]: event.target.value })} maxLength={500} placeholder="例如：已完成合影，照片会在任务站出示。"/><button disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => submit(assignment.id, completionNotes[assignment.id] ?? assignment.completion_note ?? '')}>{offline ? '联网后可提交' : assignment.status === 'rejected' ? '补充完成 · 再次提交' : '我已完成 · 提交验证'}</button></div>}</div></article>)}
    </section>}
    {isActivePlayer && <section className="section-card"><div className="section-heading"><div><small>SPY CLUES</small><h2>已解锁线索</h2></div><span>{data.clues.length}</span></div>{data.clues.length === 0 ? <div className="empty-state">完成任务后，线索会在这里出现。</div> : data.clues.map((clue) => <div className="clue" key={clue.id}><strong>{clue.title}</strong><p>{clue.content}</p></div>)}</section>}
    {isActivePlayer && data.game?.voting_open && <section className="section-card"><div className="section-heading"><div><small>FINAL VOTE</small><h2>谁是恶作剧者？</h2></div><span>第 {data.game.voting_round} 轮</span></div><p className="muted">只能选择本队宾客。每人只有一次机会，确认后不能改票。</p><div className="vote-grid">{data.candidates.filter((candidate) => candidate.id !== data.guest.id).map((candidate) => <button disabled={busy || offline || Boolean(data.existingVote)} className={data.existingVote === candidate.id ? 'vote-choice selected' : 'vote-choice'} key={candidate.id} onClick={() => vote(candidate.id)}>{data.existingVote === candidate.id ? '✓ ' : ''}{candidate.name}</button>)}</div>{data.existingVote && <p className="vote-offline-note">你的本轮投票已安全保存。</p>}{offline && <p className="vote-offline-note">恢复网络后才能提交投票。</p>}</section>}
    {isActivePlayer && data.game?.results_visible && data.results && <section className="reveal-card"><small>THE FINAL REVEAL</small><h2>身份揭晓</h2>{data.results.votedTargetName ? <div className={`vote-verdict ${data.results.voteCorrect ? 'correct' : 'missed'}`}><span>你投给了 {data.results.votedTargetName}</span><strong>{data.results.voteCorrect ? `成功找到恶作剧者 · 获得 ${data.results.bonusPoints} 分` : '恶作剧者成功隐藏了自己'}</strong></div> : <div className="vote-verdict missed"><strong>你没有提交最终投票</strong></div>}{typeof data.results.spyPoints === 'number' && <div className="spy-score-result"><span>你的恶作剧积分</span><strong>{data.results.spyPoints} 分</strong><small>此积分独立计算，不影响公开团队排名。</small></div>}<div className="team-role-reveal">{data.results.teamMembers.map((member) => <div key={member.id}><span>{member.name}</span><strong>{member.is_hidden_spy ? '丘比特的暗线（隐藏间谍）' : ROLE_LABELS[member.role]?.title ?? member.role}</strong></div>)}</div><p>感谢你成为这场婚礼故事的一部分。</p></section>}
    <div className="footer-actions"><button className="secondary" disabled={syncing} onClick={() => void load()}>{syncing ? '同步中…' : '刷新状态'}</button><button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button></div>
    {offlineReady && <div className="offline-ready" role="status">弱网备用已准备 · 刷新后仍可打开本页</div>}
  </main>;
}
