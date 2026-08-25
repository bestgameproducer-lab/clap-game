import Link from 'next/link';
import {
  FLAGSHIP_TEMPLATE,
  PLATFORM_MODULES,
  PLATFORM_PLANS,
} from '../../lib/platform/catalog';
import styles from './platform.module.css';

const DELIVERY_STEPS = [
  {
    index: '01',
    title: '选择故事方向',
    copy: '先确定婚礼气质、宾客关系与互动强度，不从功能清单开始。',
  },
  {
    index: '02',
    title: '组合游戏模块',
    copy: '从秘密任务、团队游戏、主持人台和终局揭晓中选择需要的部分。',
  },
  {
    index: '03',
    title: '完成内容定制',
    copy: '替换新人故事、角色、题库、视觉与现场规则，形成独立婚礼版本。',
  },
  {
    index: '04',
    title: '彩排后正式上线',
    copy: '用模拟宾客跑完整流程，通过检查后再开放正式签到入口。',
  },
] as const;

export default function PlatformHome() {
  return (
    <main className={styles.platformShell}>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/platform" aria-label="婚礼游戏工坊首页">
          <span>W</span>
          <div>
            <strong>婚礼游戏工坊</strong>
            <small>WEDDING PLAY STUDIO</small>
          </div>
        </Link>
        <nav className={styles.nav} aria-label="平台导航">
          <a className={styles.navLink} href="#template">模板</a>
          <a className={styles.navLink} href="#process">流程</a>
          <a className={styles.navLink} href="#plans">合作方式</a>
        </nav>
        <Link className={styles.headerCta} href="/platform/create">开始定制</Link>
      </header>

      <section className={styles.heroSection}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>FROM ONE REAL WEDDING · TO YOURS</p>
          <h1>把一场婚礼，<br />变成只属于你们的游戏世界。</h1>
          <p className={styles.heroLead}>
            不是临时拼凑的小游戏，而是一套从签到、仪式到晚宴终章都能被主持、被参与、被记住的互动体验。
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/platform/create">
              定制我的婚礼方案 <span>→</span>
            </Link>
            <a className={styles.secondaryAction} href="#template">查看真实模板</a>
          </div>
          <div className={styles.heroProof} aria-label="平台能力概览">
            <div><strong>5</strong><span>完整操作端</span></div>
            <div><strong>2</strong><span>种交付方式</span></div>
            <div><strong>1:1</strong><span>婚礼实例隔离</span></div>
          </div>
        </div>

        <div className={styles.heroPreview} aria-label="婚礼游戏方案预览">
          <div className={styles.previewTopline}>
            <span>LIVE WEDDING WORLD</span>
            <b>模板预览</b>
          </div>
          <div className={styles.previewInvitation}>
            <small>A SECRET INVITATION</small>
            <h2>我们把爱，藏进了一场游戏里</h2>
            <p>领取身份 · 完成任务 · 找到同伴 · 见证揭晓</p>
          </div>
          <div className={styles.previewJourney}>
            <article><span>01</span><div><small>CHECK IN</small><strong>签到抽卡</strong></div><b>已配置</b></article>
            <article><span>02</span><div><small>SECRET PLAY</small><strong>秘密任务</strong></div><b>23 项</b></article>
            <article><span>03</span><div><small>DINNER GAMES</small><strong>晚宴组队游戏</strong></div><b>4 轮</b></article>
            <article><span>04</span><div><small>THE FINALE</small><strong>终局投票揭晓</strong></div><b>压轴</b></article>
          </div>
          <div className={styles.previewFooter}>
            <span>宾客端</span><span>主持台</span><span>任务站</span><span>大屏</span>
          </div>
        </div>
      </section>

      <section className={styles.promiseStrip} aria-label="产品原则">
        <p>先有故事，再选玩法</p><i />
        <p>每场婚礼独立运行</p><i />
        <p>手机扫码即可参与</p><i />
        <p>完整彩排后再上线</p>
      </section>

      <section className={styles.section} id="template">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>FLAGSHIP TEMPLATE · {FLAGSHIP_TEMPLATE.version}</p>
            <h2>从一场真正办完的婚礼开始。</h2>
          </div>
          <p>第一套模板不是概念样片。它已经覆盖宾客、主持人、主办方、任务核验和投影大屏的完整现场协作。</p>
        </div>

        <div className={styles.templateGrid}>
          <article className={styles.flagshipCard}>
            <div className={styles.flagshipMark}>♧</div>
            <p className={styles.eyebrow}>THE CUPID WEDDING TRIAL</p>
            <h3>{FLAGSHIP_TEMPLATE.name}</h3>
            <p>{FLAGSHIP_TEMPLATE.promise}</p>
            <div className={styles.surfaceList}>
              {FLAGSHIP_TEMPLATE.provenSurfaces.map((surface) => <span key={surface}>{surface}</span>)}
            </div>
            <Link href="/platform/templates/cupid-wedding-trial">查看模板完整结构 <span>→</span></Link>
          </article>

          <div className={styles.moduleGrid}>
            {PLATFORM_MODULES.map((module, index) => (
              <article key={module.id} className={styles.moduleCard}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <small>{module.stage}</small>
                <h3>{module.name}</h3>
                <p>{module.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.processSection}`} id="process">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>A CLEAR PATH TO WEDDING DAY</p>
            <h2>把复杂系统，变成四个清楚步骤。</h2>
          </div>
          <p>新人只需要做关于故事与宾客的选择，技术部署、权限边界和现场检查由产品流程接住。</p>
        </div>
        <div className={styles.processGrid}>
          {DELIVERY_STEPS.map((step) => (
            <article key={step.index}>
              <span>{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="plans">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>CHOOSE HOW YOU WANT TO OWN IT</p>
            <h2>办一场，或把它变成长期服务。</h2>
          </div>
          <p>价格暂不在预览阶段锁死。方案选择会先影响交付、托管和更新范围，正式付款接入前再确认最终商业条款。</p>
        </div>
        <div className={styles.planGrid}>
          {PLATFORM_PLANS.map((plan) => (
            <article key={plan.id} className={plan.id === 'subscription' ? styles.featuredPlan : styles.planCard}>
              <p className={styles.eyebrow}>{plan.eyebrow}</p>
              <h3>{plan.name}</h3>
              <p>{plan.summary}</p>
              <strong>{plan.bestFor}</strong>
              <ul>{plan.includes.map((item) => <li key={item}>{item}</li>)}</ul>
              <Link href={`/platform/create?plan=${plan.id}`}>选择这个方案 <span>→</span></Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>YOUR WEDDING · YOUR RULES</p>
        <h2>先用十分钟，做出你们的第一版婚礼游戏方案。</h2>
        <p>不需要注册，不会改动现有婚礼数据。当前阶段的草稿只保存在你的设备上。</p>
        <Link className={styles.primaryAction} href="/platform/create">开始定制 <span>→</span></Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span>W</span>
          <div><strong>婚礼游戏工坊</strong><small>WEDDING PLAY STUDIO</small></div>
        </div>
        <p>把宾客从旁观者，变成故事的一部分。</p>
      </footer>
    </main>
  );
}
