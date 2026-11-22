// 开发用实现：头像昵称与排行榜写死，存档在 localStorage，广告是模拟的。
// 浏览器试玩、截图都用它；真实平台接入前三端都先跑它（docs/04 第 5 节）。
import { sys } from 'cc';
import { AdResult, Capability, PlatformBase, Profile, RankEntry, VibrateKind, WindowRect } from './platformBase';
import { loadPlatformConfig } from './platformConfig';

const PREFIX = 'antsort.'; // 存档键前缀 = game.json 的 codeName + '.'（./run.sh check 会查两边一致）

/** 模拟广告页由界面层提供（平台层不碰界面）：Boot 启动时注入 */
export interface MockAdView {
  show(kind: 'rewarded' | 'interstitial', placement: string): Promise<AdResult>;
  banner(placement: string | null): void;
}

export class PlatformDebug extends PlatformBase {
  readonly id = 'debug';
  /** 这一版有没有广告：跟 game.json 的 ads.enabled 走，地址栏 ?ads=1 / ?ads=0 能临时改（看两种版本的界面） */
  hasAds = false;
  /** 广告测试页可以把它关掉，检查「广告暂时加载不出来」时的降级表现 */
  adsOn = false;
  view: MockAdView | null = null;
  /** 今天每个广告位展示了几次（广告测试页看） */
  shown: Record<string, number> = {};
  private privacyUrl = '';

  override async init(): Promise<void> {
    const q = this.launchQuery().ads;
    const cfg = await loadPlatformConfig();
    this.hasAds = q === '1' ? true : q === '0' ? false : cfg.adsEnabled === true;
    // 网页调试带 App 的全部语言；?lang=ja 这样指定系统语言（看各语言的默认选择）
    if (cfg.languages?.app?.length) this.languages = cfg.languages.app;
    this.adsOn = this.hasAds;
    this.privacyUrl = cfg.privacyPolicy ?? '';
    this.reloadOnResize();
  }

  /**
   * 网页版：界面按启动时的屏幕尺寸排一次版（Screen.init），之后窗口变了（浏览器开发者工具切机型、拖窗口、横竖屏）
   * 版面不会跟着重排，按钮会跑出屏幕。所以宽度变了、或高度变了一成五以上，就重新载入页面（地址栏参数不变）。
   * 手机浏览器地址栏收起放下只动一点高度，不算
   */
  private reloadOnResize(): void {
    const w = globalThis as unknown as {
      innerWidth?: number;
      innerHeight?: number;
      addEventListener?: (type: string, fn: () => void) => void;
      location?: { reload(): void };
    };
    if (!w.addEventListener || !w.location || !w.innerWidth || !w.innerHeight) return;
    const w0 = w.innerWidth;
    const h0 = w.innerHeight;
    let timer: ReturnType<typeof setTimeout> | null = null;
    w.addEventListener('resize', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const dw = Math.abs((w.innerWidth ?? w0) - w0);
        const dh = Math.abs((w.innerHeight ?? h0) - h0) / h0;
        if (dw > 2 || dh > 0.15) w.location?.reload();
      }, 400);
    });
  }

  override openPrivacyPolicy(): void {
    if (this.privacyUrl) sys.openURL(this.privacyUrl);
  }

  override systemLanguage(): string {
    return this.launchQuery().lang ?? String(sys.languageCode ?? '');
  }

  override adsAvailable(): boolean {
    return this.adsOn;
  }

  // 模拟广告页（docs/01）：激励视频全屏、5 秒倒计时，「看完」「中途关闭」「加载失败」；插屏 1 秒后出关闭键
  override async showRewarded(placement: string): Promise<AdResult> {
    if (!this.adsOn) return 'unavailable';
    this.shown[placement] = (this.shown[placement] ?? 0) + 1;
    if (!this.view) return 'done';
    return this.view.show('rewarded', placement);
  }

  override async showInterstitial(placement: string): Promise<boolean> {
    if (!this.adsOn) return false;
    this.shown[placement] = (this.shown[placement] ?? 0) + 1;
    if (this.view) return (await this.view.show('interstitial', placement)) !== 'unavailable';
    return true;
  }

  override showBanner(placement: string): void {
    if (!this.adsOn) return;
    this.shown[placement] = (this.shown[placement] ?? 0) + 1;
    this.view?.banner(placement);
  }

  override hideBanner(): void {
    this.view?.banner(null);
  }

  // 开发阶段分享即成功（微信对分享得奖励有限制，接平台时按当时规则改）
  override async share(_payload: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  override async getProfile(): Promise<Profile | null> {
    return { nickname: '测试玩家', avatar: '' };
  }

  override async getRankList(_board: string): Promise<RankEntry[]> {
    const names = ['小星星', 'SkyRunner', '橘子汽水', 'MintWave', '小饼干', 'PixelKing', '云朵朵', 'Luna'];
    const scores = [38, 32, 29, 21, 18, 12, 7, 3];
    return names.map((name, i) => ({ name, avatar: '', score: scores[i] ?? 0 }));
  }

  override loadData(key: string): string {
    const v: unknown = sys.localStorage.getItem(PREFIX + key);
    return typeof v === 'string' ? v : '';
  }

  override saveData(key: string, value: string): void {
    sys.localStorage.setItem(PREFIX + key, value);
  }

  // 浏览器：安卓 Chrome 支持 navigator.vibrate，桌面和 iOS 没有（不报错，直接不震）
  override vibrate(kind: VibrateKind): void {
    const nav = globalThis.navigator as (Navigator & { vibrate?: (ms: number) => boolean }) | undefined;
    nav?.vibrate?.(kind === 'light' ? 12 : kind === 'medium' ? 25 : 45);
  }

  override track(event: string, params: Record<string, unknown> = {}): void {
    console.log('[track]', event, params);
  }

  override hasCapability(cap: Capability): boolean {
    if (cap === 'ads') return this.hasAds;
    if (cap === 'ad_test') return this.hasAds;
    if (cap === 'privacy_policy') return this.privacyUrl !== '';
    return cap === 'friend_rank' || cap === 'share' || cap === 'vibrate';
  }

  /**
   * 模拟手机的刘海和微信的胶囊按钮（地址栏加 ?notch=1、?capsule=1；./run.sh 里同样能带），
   * 按 iPhone 15 的尺寸：宽 393，状态栏 + 灵动岛 59，底部手势条 34，胶囊在 y 63–95、x 300–387
   */
  override safeArea(): WindowRect | null {
    const q = this.launchQuery();
    if (q.notch !== '1' && q.capsule !== '1') return null;
    return { top: 59, bottom: 852 - 34, left: 0, right: 393, windowWidth: 393, windowHeight: 852 };
  }

  override menuButton(): WindowRect | null {
    if (this.launchQuery().capsule !== '1') return null;
    return { top: 63, bottom: 95, left: 300, right: 387, windowWidth: 393, windowHeight: 852 };
  }

  override launchQuery(): Record<string, string> {
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    const out: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => (out[k] = v));
    return out;
  }
}
