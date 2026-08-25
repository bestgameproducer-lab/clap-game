import type { Metadata } from 'next';
import Link from 'next/link';
import { FLAGSHIP_TEMPLATE, PLATFORM_MODULES } from '../../../../lib/platform/catalog';
import styles from '../../platform.module.css';

export const metadata: Metadata = {
  title: '丘比特的婚礼考验 · 旗舰婚礼游戏模板',
  description: '查看婚礼游戏工坊旗舰模板的完整流程、操作端、可定制内容与正式交付标准。',
};

const STORY_ACTS = [
  {
    index: 'ACT I',
    title: '签到抽卡',
    copy: '宾客验证邀请、找到自己的名字、设置密码、上传头像并独立领取身份与第一轮任务。',
    operator: '主办方控制注册与名单，宾客端保护隐藏身份。',
  },
  {
    index: 'ACT II',
    title: '秘密相遇',
    copy: '爱心与星星完成配对，普通任务进入审核，隐藏角色在不泄密的前提下推进自己的故事。',
    operator: '任务站核验证据，系统幂等结算个人积分。',
  },
  {
    index: 'ACT III',
    title: '晚宴组队',
    copy: '主持人使用题库、计分和随机工具推进现场游戏，团队排名与私密线索各自保持正确边界。',
    operator: '主持人台控场，公开大屏只展示允许公开的内容。',
  },
  {
    index: 'FINALE',
    title: '投票与揭晓',
    copy: '宾客完成最终判断，系统锁定票数与奖励，再由主办方不可逆地发布身份、排名与奖项。',
    operator: '服务端统一结算，公布前不让正确答案进入浏览器。',
  },
] as const;

const CUSTOMIZABLE = [
  '新人姓名、婚礼日期、地点与品牌文字',
  '颜色、字体、插画、邀请页与二维码物料',
  '宾客组别、固定角色、秘密身份与分配数量',
  '两轮任务、验证方式、分值与主持人口播',
  '团队游戏题库、新人问答与现场奖项',
  '大屏标题、流程文案、最终揭晓与导出内容',
] as const;

const GUARANTEED = [
  '不同婚礼的运行数据互相隔离',
  '隐藏身份与正确答案由服务端裁决',
  '每次计分和关键操作保留审计边界',
  '手机、微信内置浏览器与投影端兼容',
  '弱网提示、重复操作保护和现场恢复路径',
  '正式上线前完成全角色、全阶段流程彩排',
] as const;

export default function FlagshipTemplatePage() {
  return (
    <main className={styles.templateDetailShell}>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊">
          <span>W</span>
          <div><strong>婚礼游戏工坊</strong><small>FLAGSHIP TEMPLATE</small></div>
        </Link>
        <nav className={styles.nav} aria-label="模板详情导航">
          <a className={styles.navLink} href="#story">故事流程</a>
          <a className={styles.navLink} href="#scope">定制边界</a>
          <a className={styles.navLink} href="#delivery">交付标准</a>
        </nav>
        <Link className={styles.headerCta} href="/platform/create">使用此模板</Link>
      </header>

      <section className={styles.templateDetailHero}>
        <div>
          <p className={styles.eyebrow}>PROVEN AT A REAL WEDDING · VERSION {FLAGSHIP_TEMPLATE.version}</p>
          <h1>{FLAGSHIP_TEMPLATE.name}</h1>
          <p>{FLAGSHIP_TEMPLATE.promise}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/platform/create">以此模板开始定制 <span>→</span></Link>
            <Link className={styles.secondaryAction} href="/platform">返回平台介绍</Link>
          </div>
        </div>
        <aside className={styles.templateProofCard}>
          <small>LIVE-PROVEN FOUNDATION</small>
          <strong>一场真实婚礼<br />完整跑通的系统底座</strong>
          <p>不是交付同一份宾客数据，而是从稳定版本创建一套属于新客户的独立实例。</p>
          <div>{FLAGSHIP_TEMPLATE.provenSurfaces.map((surface) => <span key={surface}>{surface}</span>)}</div>
        </aside>
      </section>

      <section className={styles.templateStorySection} id="story">
        <div className={styles.templateSectionHeading}>
          <p className={styles.eyebrow}>THE COMPLETE GUEST JOURNEY</p>
          <h2>不是四个孤立游戏，<br />而是一条完整故事线。</h2>
        </div>
        <div className={styles.storyActs}>
          {STORY_ACTS.map((act) => (
            <article key={act.index}>
              <span>{act.index}</span>
              <h3>{act.title}</h3>
              <p>{act.copy}</p>
              <small>{act.operator}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.templateModuleSection}>
        <div className={styles.templateSectionHeading}>
          <p className={styles.eyebrow}>MODULAR BY DESIGN</p>
          <h2>保留验证过的底层，<br />按现场需要组合模块。</h2>
        </div>
        <div className={styles.templateModuleList}>
          {PLATFORM_MODULES.map((module, index) => (
            <article key={module.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><small>{module.stage}</small><h3>{module.name}</h3><p>{module.description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.scopeSection} id="scope">
        <article>
          <p className={styles.eyebrow}>MADE FOR YOUR STORY</p>
          <h2>每场婚礼会被重新定制</h2>
          <ul>{CUSTOMIZABLE.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article>
          <p className={styles.eyebrow}>NEVER CUSTOMIZED AWAY</p>
          <h2>这些安全底线不会打折</h2>
          <ul>{GUARANTEED.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </section>

      <section className={styles.deliverySection} id="delivery">
        <div>
          <p className={styles.eyebrow}>READY MEANS REHEARSED</p>
          <h2>交付的不是一条网址，<br />而是一场可以被执行的婚礼。</h2>
        </div>
        <ol>
          <li><span>01</span><p><strong>内容冻结</strong>角色、任务、题库、奖项和隐私边界全部确认。</p></li>
          <li><span>02</span><p><strong>实例预检</strong>账号、容量、流程状态、存储和密钥全部通过。</p></li>
          <li><span>03</span><p><strong>完整彩排</strong>覆盖所有宾客类型、工作人员通道、阶段与异常路径。</p></li>
          <li><span>04</span><p><strong>现场交接</strong>提供二维码、操作手册、角色分工和网络故障备用方案。</p></li>
        </ol>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>START FROM A PROVEN WORLD</p>
        <h2>用这个模板，生成属于你们的第一版方案。</h2>
        <p>先选择故事、规模和模块。当前草稿仅保存在你的设备上，不会进入任何正式婚礼数据。</p>
        <Link className={styles.primaryAction} href="/platform/create">开始定制 <span>→</span></Link>
      </section>
    </main>
  );
}
