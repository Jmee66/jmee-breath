import type { Exercise } from '@core/types'

/**
 * Exercices preset — bundlés dans l'app, jamais poussés vers Supabase.
 */

export const PRESET_EXERCISES: Exercise[] = [
  {
    id: 'preset-box-breathing',
    name: 'Box Breathing',
    description:
      'Respiration au carré — Régulation du système nerveux par 4 phases de durées identiques (Inspire / Plein / Expire / Vide).\n\n' +
      "Bienfaits : Stabilise le rythme cardiaque, réduit l'anxiété de performance et réhabitue doucement le corps à la sensation de soif d'air (CO2).\n\n" +
      'Cycle de 5,5s :\n' +
      '1. Inspiration (5,5s) — Respiration abdominale lente.\n' +
      '2. Rétention Pleine (5,5s) — Relâchement des épaules et de la gorge.\n' +
      "3. Expiration (5,5s) — Sortie d'air fluide et sans tension.\n" +
      '4. Rétention Vide (5,5s) — Détente de la cage thoracique malgré l\'absence d\'air.\n\n' +
      "5 minutes par jour pour calmer l'hyper-vigilance.",
    category: 'breathing',
    difficulty: 1,
    tags: [],
    phases: [
      { type: 'inhale',   durationSeconds: 5.5, label: 'Respiration abdominale lente' },
      { type: 'hold',     durationSeconds: 5.5, label: 'Relâche épaules et gorge' },
      { type: 'exhale',   durationSeconds: 5.5, label: "Air fluide, sans tension" },
      { type: 'hold',     durationSeconds: 5.5, label: 'Détends la cage thoracique' },
    ],
    repetitions: 14,
    restBetweenRepsSeconds: 0,
    isPreset: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
]
