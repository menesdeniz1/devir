import { WORLD } from '../data/world';
import type { MatchConfig } from '../sim/types';
import { SAVE_INTERVAL_SEC } from './constants';
import { addResult, difficultyOf, loadResults, resultKindOf, saveResults, type Difficulty, type ResultsData } from './results';
import { infoOf, SaveSlot, type SaveFailure, type SaveInfo } from './save';
import type { Session, SessionEvent } from './session';
import { SettingsStore } from './settings';
import { SafeStorage, type KeyValueStorage } from './storage';
import { TutorialRunner } from './tutorial';
import { loadTutorialStatus, saveTutorialStatus, type TutorialStatus } from './tutorialStatus';
import { GAME_VERSION } from './version';

/** Hangi ekranın açık olduğu. Ayarlar ayrı bir katmandır (`settingsOpen`); duraklatma ve sonuç savaş ekranının parçasıdır. */
export type Screen = 'menu' | 'setup' | 'battle';

export type FlowNotice =
  /** Kayıt doğrulamayı geçemedi ve silindi (PRD ÖK-04). */
  | { kind: 'saveInvalid'; failure: SaveFailure }
  /** Kayıt yazılamadı (kota, gizli pencere); oyun sürer, bir kez bildirilir (TDD §9). */
  | { kind: 'saveWriteFailed' };

export type FlowEvent = { type: 'screen' } | { type: 'settingsOpen' } | { type: 'save' } | { type: 'results' } | { type: 'tutorial' };

export interface FlowOptions {
  session: Session;
  /** Tarayıcıda localStorage; erişilemiyorsa null (oyun kayıtsız sürer). */
  storage: KeyValueStorage | null;
  /** Saat kaynağı (ms); varsayılan Date.now. Yalnız kayıt/sonuç damgası içindir, simülasyona girmez. */
  now?: () => number;
  /** Yeni maç tohumu kaynağı; varsayılan rastgele. */
  newSeed?: () => number;
  gameVersion?: string;
}

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 0x7ffffffe);
}

/**
 * Ekran akışı + kalıcılık orkestrasyonu (başsız; DOM bilmez). Oturumu (Session) kurar/yükler, ne zaman
 * kaydedileceğine karar verir, maç sonucunu geçmişe yazar ve kayıt hatalarını bildirir.
 */
export class Flow {
  readonly session: Session;
  readonly settings: SettingsStore;
  private readonly store: SafeStorage;
  private readonly slot: SaveSlot;
  private readonly now: () => number;
  private readonly newSeed: () => number;
  private readonly listeners = new Set<(event: FlowEvent) => void>();
  private readonly noticeListeners = new Set<(notice: FlowNotice) => void>();
  private pendingNotices: FlowNotice[] = [];
  private readonly unsubscribeSession: () => void;

  private currentScreen: Screen = 'menu';
  private settingsVisible = false;
  private currentSave: SaveInfo | null = null;
  private currentResults: ResultsData;
  private lastSaveTick = 0;
  private runner: TutorialRunner | null = null;
  private tutorialState: TutorialStatus | null;
  private offerAnswered = false;

  constructor(options: FlowOptions) {
    this.session = options.session;
    this.now = options.now ?? (() => Date.now());
    this.newSeed = options.newSeed ?? randomSeed;
    this.store = new SafeStorage(options.storage);
    this.slot = new SaveSlot(this.store, options.gameVersion ?? GAME_VERSION);
    this.settings = new SettingsStore(this.store);
    this.currentResults = loadResults(this.store);
    this.tutorialState = loadTutorialStatus(this.store);
    this.store.onWriteFailure(() => this.notify({ kind: 'saveWriteFailed' }));
    // Menüdeyken oyun ilerlemez (başlangıçta oturum bir arka plan maçı tutar).
    this.session.pause();
    this.refreshSave();
    this.unsubscribeSession = this.session.subscribe((event) => this.onSessionEvent(event));
  }

  // ---- Okuma ---------------------------------------------------------------

  get screen(): Screen {
    return this.currentScreen;
  }

  get settingsOpen(): boolean {
    return this.settingsVisible;
  }

  /** Geçerli kayıt özeti; kayıt yoksa ya da geçersizse null. */
  get saveInfo(): SaveInfo | null {
    return this.currentSave;
  }

  get results(): ResultsData {
    return this.currentResults;
  }

  /** Çalışan öğretici (varsa). Öğretici maçı kaydedilmez ve sonuç geçmişine yazılmaz (PRD ÖK-08). */
  get tutorial(): TutorialRunner | null {
    return this.runner;
  }

  get tutorialStatus(): TutorialStatus | null {
    return this.tutorialState;
  }

  /** İlk açılışta (öğretici durumu hiç yazılmamışken) ana menüde öğretici önerilir (PRD ÖK-01). */
  get tutorialOfferPending(): boolean {
    return this.tutorialState === null && !this.offerAnswered && this.runner === null;
  }

  // ---- Ekranlar ------------------------------------------------------------

  openSetup(): void {
    if (this.currentScreen !== 'menu') return;
    this.currentScreen = 'setup';
    this.emit({ type: 'screen' });
  }

  closeSetup(): void {
    if (this.currentScreen !== 'setup') return;
    this.currentScreen = 'menu';
    this.emit({ type: 'screen' });
  }

  openSettings(): void {
    if (this.settingsVisible) return;
    this.settingsVisible = true;
    this.emit({ type: 'settingsOpen' });
  }

  closeSettings(): void {
    if (!this.settingsVisible) return;
    this.settingsVisible = false;
    this.emit({ type: 'settingsOpen' });
  }

  // ---- Maç yaşam döngüsü ---------------------------------------------------

  /**
   * Yeni maç başlatır. Geçerli bir kayıt varken `confirmed` verilmedikçe başlatmaz ve false döner (PRD ÖK-08);
   * onaylanırsa eski kayıt silinir.
   */
  startNewMatch(opponent: Difficulty, confirmed = false): boolean {
    if (this.currentSave !== null && !confirmed) return false;
    this.begin({ seed: this.newSeed(), opponent, erosion: this.settings.value.erosion });
    return true;
  }

  /** Bitmiş maçı aynı rakiple, yeni tohumla yeniden oynar (PRD EK-06, K-08). */
  replay(): void {
    // Yeniden oyna aynı kuralla: rakip ve aşınma seçimi korunur.
    const { opponent, erosion } = this.session.matchConfig;
    this.begin(erosion === undefined ? { seed: this.newSeed(), opponent } : { seed: this.newSeed(), opponent, erosion });
  }

  /** Kayıttan devam eder; maç duraklatılmış açılır. Kayıt artık geçerli değilse silinir, bildirilir ve false döner. */
  continueSaved(): boolean {
    const loaded = this.slot.load();
    if (loaded.status !== 'ok') {
      if (loaded.status === 'invalid') this.notify({ kind: 'saveInvalid', failure: loaded.failure });
      this.refreshSave(false);
      return false;
    }
    const { save } = loaded;
    this.session.startMatch(save.matchConfig, save.state);
    this.session.pause();
    this.lastSaveTick = save.state.tick;
    this.currentScreen = 'battle';
    this.settingsVisible = false;
    this.emit({ type: 'screen' });
    return true;
  }

  /** Öğretici önerisine "Şimdi değil": bir daha önerilmez, menüden açılabilir. */
  dismissTutorialOffer(): void {
    if (!this.tutorialOfferPending) return;
    this.offerAnswered = true;
    this.setTutorialStatus('dismissed');
    this.emit({ type: 'tutorial' });
  }

  /**
   * Öğretici maçını başlatır: rakipsiz özel maç + betikli adımlar. Kayıt yuvasına ve sonuç geçmişine dokunmaz,
   * var olan kayıt "Devam et" için korunur.
   */
  startTutorial(): void {
    if (this.currentScreen !== 'menu' || this.runner !== null) return;
    this.offerAnswered = true;
    // Öğretici kısadır ve kendi senaryosunu kurar: aşınma kapalı.
    this.session.startMatch({ seed: this.newSeed(), opponent: 'none', erosion: false });
    this.runner = new TutorialRunner(this.session);
    this.runner.subscribe(() => this.onTutorialChanged());
    this.runner.start();
    this.lastSaveTick = 0;
    this.currentScreen = 'battle';
    this.settingsVisible = false;
    this.emit({ type: 'tutorial' });
    this.emit({ type: 'screen' });
    this.emit({ type: 'settingsOpen' });
  }

  /** Öğreticiyi atlar: "atlandı" olarak saklanır ve ana menüye dönülür. */
  skipTutorial(): void {
    if (this.runner === null) return;
    this.setTutorialStatus('skipped');
    this.toMenu();
  }

  private setTutorialStatus(next: TutorialStatus): void {
    this.tutorialState = saveTutorialStatus(this.store, this.tutorialState, next);
  }

  private onTutorialChanged(): void {
    if (this.runner?.status === 'completed') this.setTutorialStatus('completed');
    this.emit({ type: 'tutorial' });
  }

  private endTutorial(): void {
    if (this.runner === null) return;
    // Tamamlanmadan ve atlanmadan çıkış: bir daha önerilmesin.
    if (this.tutorialState === null) this.setTutorialStatus('dismissed');
    this.runner.dispose();
    this.runner = null;
    this.emit({ type: 'tutorial' });
  }

  /** Ana menüye döner; sürmekte olan maç kaydedilir (PRD EK-05). Öğretici maçı kaydedilmez. */
  toMenu(): void {
    if (this.currentScreen === 'battle') this.saveNow();
    this.endTutorial();
    this.currentScreen = 'menu';
    this.settingsVisible = false;
    this.session.pause();
    this.emit({ type: 'screen' });
    this.emit({ type: 'settingsOpen' });
  }

  private begin(config: MatchConfig): void {
    this.slot.clear();
    this.currentSave = null;
    this.session.startMatch(config);
    this.lastSaveTick = 0;
    this.currentScreen = 'battle';
    this.settingsVisible = false;
    this.emit({ type: 'save' });
    this.emit({ type: 'screen' });
    this.emit({ type: 'settingsOpen' });
  }

  // ---- Kayıt ---------------------------------------------------------------

  /** Savaş ekranındaki bitmemiş maçı kaydeder. Yazılırsa true. */
  saveNow(): boolean {
    if (this.currentScreen !== 'battle' || this.session.ended || this.runner !== null) return false;
    const state = this.session.state;
    const savedAt = this.now();
    const ok = this.slot.write(state, savedAt);
    // Sonuçtan bağımsız: yazma başarısızsa (kota) her karede yeniden denenip tam serileştirme yapılmasın.
    this.lastSaveTick = state.tick;
    if (!ok) return false;
    this.currentSave = { opponent: state.config.opponent, tick: state.tick, playerAge: state.sides[0].age, savedAt };
    this.emit({ type: 'save' });
    return true;
  }

  /** Her karede çağrılır: periyodik kayıt (her SAVE_INTERVAL_SEC oyun saniyesinde bir). */
  update(): void {
    if (this.currentScreen === 'battle') this.runner?.update();
    if (this.currentScreen !== 'battle' || this.session.paused || this.session.ended) return;
    if (this.session.tick - this.lastSaveTick >= SAVE_INTERVAL_SEC * WORLD.tickRate) this.saveNow();
  }

  /** Kaydı yeniden okur ve doğrular; geçersizse siler ve (notify ise) bildirir. */
  private refreshSave(notify = true): void {
    const loaded = this.slot.load();
    if (loaded.status === 'ok') this.currentSave = infoOf(loaded.save);
    else {
      this.currentSave = null;
      if (loaded.status === 'invalid' && notify) this.notify({ kind: 'saveInvalid', failure: loaded.failure });
    }
    this.emit({ type: 'save' });
  }

  // ---- Oturum olayları -----------------------------------------------------

  private onSessionEvent(event: SessionEvent): void {
    if (event.type === 'paused') {
      // Duraklatma (elle ya da sekme gizlenince) anında kayıt (PRD ÖK-03).
      if (event.paused) this.saveNow();
      return;
    }
    if (event.type === 'ended') this.onMatchEnded();
  }

  private onMatchEnded(): void {
    // Öğretici maçı kayıt yuvasını silmez ve sonuç geçmişine yazılmaz (PRD ÖK-08).
    if (this.runner !== null) return;
    const state = this.session.state;
    const outcome = state.outcome;
    this.slot.clear();
    this.currentSave = null;
    this.emit({ type: 'save' });
    const opponent = difficultyOf(state.config.opponent);
    if (outcome === null || opponent === null) return;
    this.currentResults = addResult(this.currentResults, {
      at: this.now(),
      opponent,
      result: resultKindOf(outcome),
      durationTicks: outcome.tick,
      playerAge: state.sides[0].age,
    });
    saveResults(this.store, this.currentResults);
    this.emit({ type: 'results' });
  }

  // ---- Abonelik ------------------------------------------------------------

  /** Ekran, kayıt ve sonuç değişikliklerini (ve bildirimleri) dinler. */
  subscribe(listener: (event: FlowEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Yalnız bildirimleri dinler; arayüz açılmadan önce oluşan bildirimler (ör. açılışta silinen bozuk kayıt) ilk
   * bildirim dinleyicisine iletilir.
   */
  subscribeNotices(listener: (notice: FlowNotice) => void): () => void {
    this.noticeListeners.add(listener);
    const pending = this.pendingNotices;
    this.pendingNotices = [];
    for (const notice of pending) listener(notice);
    return () => this.noticeListeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribeSession();
    this.listeners.clear();
    this.noticeListeners.clear();
  }

  private notify(notice: FlowNotice): void {
    if (this.noticeListeners.size === 0) this.pendingNotices.push(notice);
    for (const listener of [...this.noticeListeners]) listener(notice);
  }

  private emit(event: FlowEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
