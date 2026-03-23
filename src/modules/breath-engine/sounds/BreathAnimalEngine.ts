/**
 * BreathAnimalEngine — couche sons naturels synthétisés.
 *
 * Chants d'oiseaux en synthèse FM avec :
 *  · 4 niveaux de proximité (très proche → très lointain)
 *  · 5 formes de contour fréquentiel naturelles (montée / descente / arche / vallée / plat)
 *  · Vibrato naturel par LFO (5.5–10 Hz, profondeur 0.8–2.2 % de la fréquence)
 *  · Décroissance ADSR paramétrée par tier (attaque rapide=proche / douce=lointain)
 *  · Harmonique secondaire pour les tiers proches (timbre riche, naturel)
 *  · Filtre passe-bas distance-dépendant (tiers lointains = son étouffé)
 *  · Ramps exponentielles (non linéaires) — évolution musicalement naturelle
 *  · Vent synthétisé : bruit filtré + LFO lent (~15 s) + rafales aléatoires
 *
 * Chaîne FM par chirp :
 *   modOsc ──► modGain ──► carrier.frequency
 *   vibLfo ──► vibGain ──► carrier.frequency
 *   carrier ──┐
 *             ├──► env ──► [lpFilter] ──► callGain
 *   h2 ──► h2Amp ──┘     (si harmonicGain > 0)
 *
 * Web Audio API Level 1 (Chrome iOS / macOS / Windows).
 */

type ChirpShape = 'rise' | 'fall' | 'arch' | 'valley' | 'flat' | 'trill' | 'glitch'

interface ProximityTier {
  gainRange:     [number, number]  // gain d'appel [min, max]
  freqRange:     [number, number]  // Hz [min, max]
  panRange:      [number, number]  // pan absolu [min, max]
  intervalRange: [number, number]  // ms entre appels [min, max]
  notesRange:    [number, number]  // notes/appel [min, max]
  /** Coupure passe-bas en Hz simulant la distance (null = pas de filtre). */
  filterFreq:    number | null
  /** Profondeur vibrato : fraction de la fréquence fondamentale. */
  vibratoDepth:  number
  /** Indice de modulation FM [min, max]. Plus élevé = plus brillant/complexe. */
  modIndexRange: [number, number]
  /** Gain du 2e harmonique (0 = désactivé). */
  harmonicGain:  number
  /** Durée d'attaque [min, max] en secondes. */
  attackRange:   [number, number]
  /** Durée de release [min, max] en secondes. */
  releaseRange:  [number, number]
  /** Formes de contour fréquentiel possibles pour ce tier. */
  shapes:        ChirpShape[]
  /** Types d'oscillateur carrier possibles (variété timbre). */
  waveTypes:     OscillatorType[]
}

const TIERS: ProximityTier[] = [
  // ── Très proche — aigu, brillant, présent, pan large ──────────────────────
  // gainRange : ×0.80 (−20% très proche) ×0.90 (−10% global) = ×0.72
  {
    gainRange:     [0.34, 0.52],
    freqRange:     [2200, 3900],
    panRange:      [0.55, 0.88],
    intervalRange: [28600, 71500],
    notesRange:    [2, 5],
    filterFreq:    null,
    vibratoDepth:  0.022,
    modIndexRange: [1.2, 4.2],
    harmonicGain:  0.18,
    attackRange:   [0.005, 0.012],
    releaseRange:  [0.025, 0.055],
    shapes:        ['rise', 'fall', 'arch', 'valley', 'flat', 'trill', 'glitch'],
    waveTypes:     ['sine', 'sine', 'triangle', 'sawtooth'],
  },
  // ── Moyen — lumineux, modéré ───────────────────────────────────────────────
  // gainRange : ×0.90 (−10% global)
  {
    gainRange:     [0.25, 0.43],
    freqRange:     [1000, 2400],
    panRange:      [0.25, 0.58],
    intervalRange: [11700, 36400],
    notesRange:    [2, 6],
    filterFreq:    null,
    vibratoDepth:  0.018,
    modIndexRange: [0.8, 3.0],
    harmonicGain:  0.10,
    attackRange:   [0.008, 0.018],
    releaseRange:  [0.035, 0.065],
    shapes:        ['rise', 'fall', 'arch', 'flat', 'trill'],
    waveTypes:     ['sine', 'sine', 'triangle'],
  },
  // ── Lointain — doux, légèrement étouffé ───────────────────────────────────
  // gainRange : ×0.90 (−10% global)
  {
    gainRange:     [0.09, 0.20],
    freqRange:     [500, 1500],
    panRange:      [0.08, 0.38],
    intervalRange: [5000, 18000],
    notesRange:    [1, 3],
    filterFreq:    1100,
    vibratoDepth:  0.012,
    modIndexRange: [0.4, 1.2],
    harmonicGain:  0.0,
    attackRange:   [0.015, 0.030],
    releaseRange:  [0.050, 0.090],
    shapes:        ['rise', 'fall', 'flat'],
    waveTypes:     ['sine'],
  },
  // ── Très lointain — quasi inaudible, centré, grave, très filtré ───────────
  // gainRange : ×0.90 (−10% global)
  {
    gainRange:     [0.032, 0.094],
    freqRange:     [300, 800],
    panRange:      [0.00, 0.18],
    intervalRange: [3500, 14000],
    notesRange:    [1, 2],
    filterFreq:    600,
    vibratoDepth:  0.008,
    modIndexRange: [0.15, 0.55],
    harmonicGain:  0.0,
    attackRange:   [0.025, 0.045],
    releaseRange:  [0.070, 0.120],
    shapes:        ['rise', 'fall'],
    waveTypes:     ['sine'],
  },
]

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1))
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathAnimalEngine {
  private readonly masterGain: GainNode
  private timers:     ReturnType<typeof setTimeout>[] = []
  private windTimers: ReturnType<typeof setTimeout>[] = []
  private running = false

  // ── Vent ──────────────────────────────────────────────────────────────────
  private windSource:   AudioBufferSourceNode | null = null
  private windGustGain: GainNode | null       = null
  private windLfo:      OscillatorNode | null = null

  constructor(private readonly audioCtx: AudioContext, volume: number) {
    this.masterGain            = audioCtx.createGain()
    this.masterGain.gain.value = volume
    this.masterGain.connect(audioCtx.destination)
  }

  start(): void {
    if (this.running) return
    this.running = true
    TIERS.forEach((tier, i) => {
      const initial = rand(800 + i * 1200, 5000 + i * 2000)
      this.scheduleNext(tier, initial)
    })
    this.startWind()
  }

  stop(): void {
    this.running = false
    this.timers.forEach(clearTimeout)
    this.timers = []
    this.stopWind()
  }

  /** Volume live (lissage 80 ms). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────

  private scheduleNext(tier: ProximityTier, delayMs: number): void {
    const t = setTimeout(() => {
      // Retire ce timer de la liste — évite la croissance indéfinie
      const idx = this.timers.indexOf(t)
      if (idx !== -1) this.timers.splice(idx, 1)

      if (!this.running) return
      if (this.audioCtx.state === 'running') this.playCall(tier)
      this.scheduleNext(tier, rand(tier.intervalRange[0], tier.intervalRange[1]))
    }, delayMs)
    this.timers.push(t)
  }

  /** true si le moteur est actif (utilisé par useRiverAmbience pour le redémarrage). */
  get isRunning(): boolean { return this.running }

  // ── Appel complet (phrase de N notes) ─────────────────────────────────────

  private playCall(tier: ProximityTier): void {
    const ctx    = this.audioCtx
    const nNotes = randInt(tier.notesRange[0], tier.notesRange[1])
    const baseHz = rand(tier.freqRange[0], tier.freqRange[1])
    const gain   = rand(tier.gainRange[0], tier.gainRange[1])

    // Position stéréo fixe pour toute la phrase
    const panner = ctx.createStereoPanner()
    panner.pan.value = (Math.random() < 0.5 ? 1 : -1) * rand(tier.panRange[0], tier.panRange[1])

    const callGain = ctx.createGain()
    callGain.gain.value = gain
    callGain.connect(panner)
    panner.connect(this.masterGain)

    // Forme choisie une fois pour toute la phrase — cohérence musicale
    const shape = tier.shapes[Math.floor(Math.random() * tier.shapes.length)]

    let t = ctx.currentTime + 0.05
    for (let i = 0; i < nNotes; i++) {
      // Légère dérive de hauteur sur la phrase (montée ou descente naturelle)
      const hz      = baseHz * (1 + rand(-0.04, 0.08) * i * 0.30)
      const noteDur = rand(0.065, 0.22)
      const gap     = rand(0.025, 0.12)
      this.synthesizeChirp(ctx, callGain, hz, t, noteDur, tier, shape)
      t += noteDur + gap
    }

    // GC des nœuds partagés après la fin de la phrase
    const totalMs = (t - ctx.currentTime + 0.5) * 1000
    const cleanup = setTimeout(() => {
      try { panner.disconnect()   } catch { /* already gone */ }
      try { callGain.disconnect() } catch { /* already gone */ }
    }, totalMs)
    this.timers.push(cleanup)
  }

  // ── Synthèse FM d'un chirp ─────────────────────────────────────────────────

  private synthesizeChirp(
    ctx:         AudioContext,
    destination: GainNode,
    freq:        number,
    startTime:   number,
    duration:    number,
    tier:        ProximityTier,
    shape:       ChirpShape,
  ): void {
    // ── Modulateur FM ────────────────────────────────────────────────────────
    const modRatio = rand(1.5, 3.5)
    const modIndex = rand(tier.modIndexRange[0], tier.modIndexRange[1])
    const modOsc   = ctx.createOscillator()
    const modGain  = ctx.createGain()
    modOsc.type            = 'sine'
    modOsc.frequency.value = freq * modRatio
    modGain.gain.value     = freq * modIndex   // profondeur FM en Hz
    modOsc.connect(modGain)

    // ── Vibrato LFO (fréquence légèrement aléatoire pour éviter la répétition) ─
    const vibLfo  = ctx.createOscillator()
    const vibGain = ctx.createGain()
    vibLfo.type            = 'sine'
    vibLfo.frequency.value = rand(5.5, 10.0)   // 5.5–10 Hz
    vibGain.gain.value     = freq * tier.vibratoDepth
    vibLfo.connect(vibGain)

    // ── Carrier ──────────────────────────────────────────────────────────────
    const carrier = ctx.createOscillator()
    carrier.type  = tier.waveTypes[Math.floor(Math.random() * tier.waveTypes.length)]
    carrier.frequency.value = freq
    modGain.connect(carrier.frequency)   // FM : additionnel à la fréquence de base
    vibGain.connect(carrier.frequency)   // Vibrato : additionnel
    // Contour de hauteur (exponential ramp — naturel)
    this.applyFreqShape(carrier.frequency, freq, shape, startTime, duration)

    // ── Enveloppe ADSR ───────────────────────────────────────────────────────
    const attack     = rand(tier.attackRange[0], tier.attackRange[1])
    const release    = rand(tier.releaseRange[0], tier.releaseRange[1])
    const sustainLvl = rand(0.70, 0.90)
    const decay      = Math.min(0.025, duration * 0.15)
    const env = ctx.createGain()
    env.gain.value = 0
    env.gain.setValueAtTime(0, startTime)
    env.gain.linearRampToValueAtTime(1.0, startTime + attack)
    env.gain.linearRampToValueAtTime(sustainLvl, startTime + attack + decay)
    env.gain.setValueAtTime(sustainLvl, startTime + duration - release)
    env.gain.linearRampToValueAtTime(0, startTime + duration)

    carrier.connect(env)

    // ── Harmonique secondaire (tiers proches uniquement) ─────────────────────
    // Alimente le même nœud env → même enveloppe commune sur carrier + h2.
    if (tier.harmonicGain > 0) {
      const h2    = ctx.createOscillator()
      const h2Amp = ctx.createGain()
      h2.type            = 'sine'
      h2.frequency.value = freq * 2.0
      h2Amp.gain.value   = tier.harmonicGain

      // Le vibrato sur l'harmonique a une profondeur ×2 (physiquement correct)
      const h2VibGain = ctx.createGain()
      h2VibGain.gain.value = freq * tier.vibratoDepth * 2.0
      vibLfo.connect(h2VibGain)
      h2VibGain.connect(h2.frequency)
      // Même contour de hauteur (fréquence doublée)
      this.applyFreqShape(h2.frequency, freq * 2.0, shape, startTime, duration)

      h2.connect(h2Amp)
      h2Amp.connect(env)   // s'additionne au carrier dans l'enveloppe commune

      h2.start(startTime)
      h2.stop(startTime + duration + 0.025)
    }

    // ── Filtre passe-bas (simulation acoustique de la distance) ──────────────
    const stopAt = startTime + duration + 0.025
    if (tier.filterFreq !== null) {
      const lpf           = ctx.createBiquadFilter()
      lpf.type            = 'lowpass'
      lpf.frequency.value = tier.filterFreq
      lpf.Q.value         = 0.5
      env.connect(lpf)
      lpf.connect(destination)
    } else {
      env.connect(destination)
    }

    modOsc.start(startTime)
    vibLfo.start(startTime)
    carrier.start(startTime)
    modOsc.stop(stopAt)
    vibLfo.stop(stopAt)
    carrier.stop(stopAt)
  }

  // ── Contours fréquentiels ──────────────────────────────────────────────────

  /**
   * Applique un contour de hauteur sur un AudioParam fréquence.
   * Les ramps exponentielles donnent une évolution musicalement naturelle
   * (perception logarithmique des intervalles).
   */
  private applyFreqShape(
    param:     AudioParam,
    baseFreq:  number,
    shape:     ChirpShape,
    startTime: number,
    duration:  number,
  ): void {
    const end = startTime + duration
    switch (shape) {
      case 'rise': {
        const target = baseFreq * rand(1.18, 1.52)
        param.setValueAtTime(baseFreq, startTime)
        param.exponentialRampToValueAtTime(target, end)
        break
      }
      case 'fall': {
        const target = baseFreq * rand(0.66, 0.84)
        param.setValueAtTime(baseFreq, startTime)
        param.exponentialRampToValueAtTime(target, end)
        break
      }
      case 'arch': {
        const peak   = baseFreq * rand(1.28, 1.65)
        const target = baseFreq * rand(0.88, 1.06)
        const midT   = startTime + duration * rand(0.35, 0.58)
        param.setValueAtTime(baseFreq, startTime)
        param.exponentialRampToValueAtTime(peak, midT)
        param.exponentialRampToValueAtTime(target, end)
        break
      }
      case 'valley': {
        const dip    = baseFreq * rand(0.68, 0.82)
        const target = baseFreq * rand(0.92, 1.10)
        const midT   = startTime + duration * rand(0.35, 0.58)
        param.setValueAtTime(baseFreq, startTime)
        param.exponentialRampToValueAtTime(dip, midT)
        param.exponentialRampToValueAtTime(target, end)
        break
      }
      case 'trill': {
        // Alternance rapide entre deux hauteurs — effet trille/vibrato large
        const step  = rand(0.028, 0.055)
        const ratio = rand(1.06, 1.18)
        let tt = startTime
        let up = false
        while (tt < startTime + duration - step * 0.5) {
          param.setValueAtTime(up ? baseFreq * ratio : baseFreq, tt)
          tt += step
          up = !up
        }
        break
      }
      case 'glitch': {
        // Sauts de fréquence aléatoires — effet électronique/mécanique
        const nPts = randInt(3, 7)
        for (let j = 0; j <= nPts; j++) {
          const tg   = startTime + (j / nPts) * duration
          const fVal = (j === 0 || j === nPts)
            ? baseFreq
            : baseFreq * rand(0.60, 1.65)
          param.setValueAtTime(fVal, tg)
        }
        break
      }
      case 'flat':
      default:
        param.setValueAtTime(baseFreq, startTime)
        break
    }
  }

  // ── Vent ──────────────────────────────────────────────────────────────────

  /**
   * Chaîne : WhiteNoise(3 s loop) → LowpassFilter(420 Hz) → windBaseGain → windGustGain → masterGain
   *                                                               ↑
   *                                                   LFO(~0.065 Hz) → lfoDepthGain
   *
   * windBaseGain  : niveau de base (0.038), modulé lentement par le LFO (±0.018) → ondulation ~15 s
   * windGustGain  : neutre à 1.0, dopé lors des rafales (×2.2–3.8) via ramps planifiées
   */
  private startWind(): void {
    const ctx        = this.audioCtx
    const sampleRate = ctx.sampleRate
    const bufLen     = Math.floor(sampleRate * 3)

    const noiseBuffer = ctx.createBuffer(1, bufLen, sampleRate)
    const data        = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

    const filter           = ctx.createBiquadFilter()
    filter.type            = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value         = 0.6

    const windBaseGain      = ctx.createGain()
    windBaseGain.gain.value = 0.038

    const lfo           = ctx.createOscillator()
    lfo.type            = 'sine'
    lfo.frequency.value = 0.065   // ≈ 15.4 s / cycle
    const lfoDepth      = ctx.createGain()
    lfoDepth.gain.value = 0.018
    lfo.connect(lfoDepth)
    lfoDepth.connect(windBaseGain.gain)
    lfo.start()
    this.windLfo     = lfo

    const windGustGain      = ctx.createGain()
    windGustGain.gain.value = 1.0
    this.windGustGain       = windGustGain

    const source  = ctx.createBufferSource()
    source.buffer = noiseBuffer
    source.loop   = true
    source.connect(filter)
    filter.connect(windBaseGain)
    windBaseGain.connect(windGustGain)
    windGustGain.connect(this.masterGain)
    source.start()
    this.windSource = source

    this.scheduleGust()
  }

  private stopWind(): void {
    this.windTimers.forEach(clearTimeout)
    this.windTimers = []
    try { this.windSource?.stop() } catch { /* déjà stoppé */ }
    try { this.windLfo?.stop()    } catch { /* déjà stoppé */ }
    this.windSource   = null
    this.windGustGain = null
    this.windLfo      = null
  }

  /**
   * Rafale aléatoire toutes les 5–20 s.
   * Montée (1–3 s) → pic (×2.2–3.8) → descente (2–5 s) → retour à 1.0.
   */
  private scheduleGust(): void {
    const delay = rand(5000, 20000)
    const t = setTimeout(() => {
      if (!this.running || !this.windGustGain) return
      const ctx  = this.audioCtx
      const now  = ctx.currentTime
      const peak = rand(2.2, 3.8)
      const rise = rand(1.0, 3.0)
      const hold = rand(0.4, 1.8)
      const fall = rand(2.0, 5.0)

      this.windGustGain.gain.cancelScheduledValues(now)
      this.windGustGain.gain.setValueAtTime(this.windGustGain.gain.value, now)
      this.windGustGain.gain.linearRampToValueAtTime(peak, now + rise)
      this.windGustGain.gain.setValueAtTime(peak, now + rise + hold)
      this.windGustGain.gain.linearRampToValueAtTime(1.0, now + rise + hold + fall)

      this.scheduleGust()
    }, delay)
    this.windTimers.push(t)
  }
}
