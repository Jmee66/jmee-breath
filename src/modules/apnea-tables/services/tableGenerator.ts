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
 * CO2 Table :
 *   hold constant = 50 % de refMaxS
 *   récup décroissante : commence à max(2×hold, 120s), diminue de 15 s/série
 *   → travail sur la tolérance au CO₂ (taux élevé en fin)
 */
function generateCO2Rows(refMaxS: number, series: number): TableRow[] {
  const holdS = Math.round(refMaxS * 0.50 / 5) * 5        // arrondi 5s
  const startRecoveryS = Math.max(holdS * 2, 120)
  const stepS = Math.round((startRecoveryS - 15) / Math.max(series - 1, 1) / 5) * 5

  return Array.from({ length: series }, (_, i) => ({
    holdS,
    recoveryS: Math.max(15, startRecoveryS - i * stepS),
  }))
}

/**
 * O2 Table :
 *   récup constante = 120 s (2 min)
 *   hold croissant : de 50 % à 90 % de refMaxS
 *   → travail sur la capacité (O₂ qui diminue progressivement)
 */
function generateO2Rows(refMaxS: number, series: number): TableRow[] {
  const recoveryS  = 120
  const startHoldS = Math.round(refMaxS * 0.50 / 5) * 5
  const endHoldS   = Math.round(refMaxS * 0.90 / 5) * 5
  const step       = Math.round((endHoldS - startHoldS) / Math.max(series - 1, 1) / 5) * 5

  return Array.from({ length: series }, (_, i) => ({
    holdS:     Math.min(endHoldS, startHoldS + i * step),
    recoveryS,
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

/** Durée totale d'une série custom (phases actives). */
export function customSeriesDuration(phases: CustomPhase[]): number {
  return phases.filter((p) => p.enabled).reduce((acc, p) => acc + p.durationS, 0)
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
