import type { TableRow, TableType, RecoveryPattern, ApneaTable, CustomPhase, CustomPhaseType } from '../types'

// ── Constantes de génération ───────────────────────────────────────────────────

const DEFAULT_SERIES = 8

/**
 * Durées des cycles de récupération selon le pattern.
 * Utilisé pour calculer combien de cycles entrent dans recoveryS.
 */
export const RECOVERY_CYCLE_S: Record<RecoveryPattern, number> = {
  'soupir':       10,   // inspir 3s + expir 7s
  '6-6-12':       24,   // inspir 6s + rétention 6s + expir 12s
  'co2-pattern':  16,   // inspir 4s + top 2s + expir 10s
}

// ── Algorithmes de génération ──────────────────────────────────────────────────

/**
 * CO₂ Table — best practice 2024 (Apnea Academy / Pelizzari / Adam Stern)
 *
 *   Hold constant    = 50 % du PB (arrondi 5 s)
 *   Récup start      = hold × 1.5, arrondi à 15 s, borné [1:30 – 2:30]
 *   Step             = 15 s fixe (standard international)
 *   Récup minimum    = 30 s (sécurité hypoxie)
 *
 *   Objectif : le CO₂ ne se vide jamais complètement → tolérance progressive.
 *   Ratio 1:1.5 en début de table vs 1:0.35 en fin → stress CO₂ croissant.
 */
function generateCO2Rows(refMaxS: number, series: number): TableRow[] {
  const holdS = Math.round(refMaxS * 0.50 / 5) * 5

  // Récup start : hold × 1.5, arrondi au multiple de 15s le plus proche, borné [90s, 150s]
  const rawStart       = holdS * 1.5
  const startRecoveryS = Math.round(Math.min(150, Math.max(rawStart, 90)) / 15) * 15

  const STEP        = 15                   // secondes — fixe, standard
  const MIN_RECOVERY = 30                  // sécurité absolue

  return Array.from({ length: series }, (_, i) => ({
    holdS,
    recoveryS: Math.max(MIN_RECOVERY, startRecoveryS - i * STEP),
  }))
}

/**
 * O₂ Table — best practice 2024
 *
 *   Récup constante  = 2:00 (120 s) — permet la vidange CO₂, maintient la fatigue O₂
 *   Hold croissant   = 50 % → 80 % du PB (arrondi 5 s)
 *   Step             = réparti uniformément sur les séries
 *
 *   Objectif : chaque hold entame davantage les réserves O₂.
 *   80 % max (vs 90 % précédent) = progression physiologiquement sûre.
 */
function generateO2Rows(refMaxS: number, series: number): TableRow[] {
  const RECOVERY_S = 120                                          // 2:00 fixe
  const startHoldS = Math.round(refMaxS * 0.50 / 5) * 5
  const endHoldS   = Math.round(refMaxS * 0.80 / 5) * 5          // 80 % max (était 90 %)
  const step       = Math.round((endHoldS - startHoldS) / Math.max(series - 1, 1) / 5) * 5

  return Array.from({ length: series }, (_, i) => ({
    holdS:     Math.min(endHoldS, startHoldS + i * step),
    recoveryS: RECOVERY_S,
  }))
}

// ── Entrée publique ────────────────────────────────────────────────────────────

/**
 * Génère les lignes d'une table CO2 ou O2.
 *
 * @param type         co2 | o2
 * @param referenceMaxS  Référence max (PB ou personnalisée, en secondes)
 * @param formeFactor  Facteur forme du jour (−0.3 → +0.2). Modifie refMaxS.
 * @param series       Nombre de séries (défaut : 8)
 */
export function generateRows(
  type:          Exclude<TableType, 'custom'>,
  referenceMaxS: number,
  formeFactor    = 0,
  series         = DEFAULT_SERIES,
): TableRow[] {
  const effectiveRef = Math.max(10, Math.round(referenceMaxS * (1 + formeFactor)))
  switch (type) {
    case 'co2': return generateCO2Rows(effectiveRef, series)
    case 'o2':  return generateO2Rows(effectiveRef, series)
  }
}

// ── Phases custom par défaut ───────────────────────────────────────────────────

export const CUSTOM_PHASE_CONFIG: Record<CustomPhaseType, {
  label:      string
  color:      string
  defaultS:   number
  defaultDesc: string
  breathDriven: boolean   // true = BreathClock géré, false = timer + texte libre
}> = {
  prep:        { label: 'Préparation',  color: '#4a5568', defaultS: 30,  defaultDesc: 'Détends-toi, prépare-toi mentalement', breathDriven: false },
  inhale:      { label: 'Inspiration',  color: '#1a85c2', defaultS: 6,   defaultDesc: 'Inspire lentement — ventre, côtes, thorax', breathDriven: true  },
  hold:        { label: 'Rétention',    color: '#7561af', defaultS: 60,  defaultDesc: 'Rétention plein poumon, détends-toi', breathDriven: true  },
  exhale:      { label: 'Expiration',   color: '#9d7ec4', defaultS: 6,   defaultDesc: 'Expire doucement — thorax, côtes, ventre', breathDriven: true  },
  recovery:    { label: 'Récupération', color: '#34d399', defaultS: 120, defaultDesc: 'Respire librement, récupère', breathDriven: false },
  ventilation: { label: 'Ventilation',  color: '#2dd4bf', defaultS: 30,  defaultDesc: 'Ventilation active, inspire profond', breathDriven: false },
}

/** Génère le template de phases par défaut pour une table custom. */
export function defaultCustomPhases(): CustomPhase[] {
  return (['prep', 'inhale', 'hold', 'exhale', 'recovery'] as CustomPhaseType[]).map((type) => ({
    type,
    durationS:   CUSTOM_PHASE_CONFIG[type].defaultS,
    description: CUSTOM_PHASE_CONFIG[type].defaultDesc,
    enabled:     true,
  }))
}

/** Durée totale d'une série custom (phases actives, en tenant compte de repeatCount). */
export function customSeriesDuration(phases: CustomPhase[]): number {
  return phases
    .filter((p) => p.enabled)
    .reduce((acc, p) => acc + p.durationS * (p.repeatCount ?? 1), 0)
}

/**
 * Durée totale d'une table (hold + recovery de chaque ligne, en secondes).
 */
export function totalTableDuration(rows: TableRow[]): number {
  return rows.reduce((acc, r) => acc + r.holdS + r.recoveryS, 0)
}

/**
 * Formate une durée en mm:ss.
 */
export function fmtTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = Math.round(s % 60)
  return m > 0 ? `${m}:${String(ss).padStart(2, '0')}` : `${ss}s`
}

/**
 * Personal Best : retourne le max des durationSeconds des FreeTimerSessions
 * en mode 'apnea'. Null si aucun historique.
 */
export async function getPersonalBest(): Promise<number | null> {
  const { db } = await import('@core/db/apneaDb')
  const sessions = await db.freeTimerSessions.toArray()
  const apneaSessions = sessions.filter((s) => s.mode === 'apnea' && s.durationSeconds > 0)
  if (apneaSessions.length === 0) return null
  return Math.max(...apneaSessions.map((s) => s.durationSeconds))
}

/**
 * Construit un objet ApneaTable complet prêt à sauvegarder.
 */
export function buildTable(
  params: Pick<ApneaTable, 'name' | 'type' | 'referenceMaxS' | 'seriesCount' | 'recoveryPattern' | 'formeFactor'>,
): Omit<ApneaTable, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'> {
  const rows = generateRows(params.type, params.referenceMaxS, params.formeFactor, params.seriesCount)
  return { ...params, rows }
}
