# Règles du module `free-timer`

---

## ⚠️ Règle critique — Tailwind JIT

Même contrainte que le module `exercises` : certaines classes Tailwind ne compilent pas sur les fichiers créés après le scan initial.

**Règle : toujours utiliser des inline styles pour le spacing, les couleurs dynamiques, et tout ce qui varie selon l'état.**

Variables CSS disponibles :
`var(--color-border)`, `var(--color-text-primary)`, `var(--color-text-secondary)`,
`var(--color-text-muted)`, `var(--color-accent)`, `var(--color-bg-surface)`,
`var(--color-bg-elevated)`, `var(--color-bg-overlay)`

---

## Layout général de `FreeTimerPage`

```
┌─────────────────────────────────────────────┐
│ Timer              Apnée statique       🔊  │  ← PageContainer (title + actions)
│ ─────────────────────────────────────────── │  ← borderBottom widgets row
│ Best session   Personal best   Base setup   │  ← widgets row (toujours visible)
│─────────────────────────────────────────────│
│  [vue selon phase : idle / warmup /         │
│   running / finished]                       │
└─────────────────────────────────────────────┘
```

- Les widgets (Best session, Personal best, Base setup) sont **toujours visibles**, quelle que soit la phase.
- Le bouton son 🔊 est dans le prop `actions` de `PageContainer` — accessible en tout temps.
- La ligne de séparation (`borderBottom`) est sur la div des widgets, pas dans PageContainer.

---

## WarmupView — règles de mise en page

### En-tête d'étape

```
Respiration  LE FLASH · PHASE 1
```

- **Label du type d'étape** (ex: Respiration, Rétention, CO₂…) : texte principal, grand, coloré (`visual.color`, `1.4rem`, `fontWeight: 700`).
- **Protocole · Phase** : sur la **même ligne**, juste après le label, aligné sur la baseline (`alignItems: 'baseline'`, `gap: '0.75rem'`). Taille réduite (`0.68rem`), couleur très atténuée (`rgba(255,255,255,0.35)`), uppercase.
- **Jamais de badge/pill séparé** pour le type ni pour la phase — tout sur une ligne unique.

```tsx
<div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: visual.color }}>
    {visual.label}
  </span>
  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
    {display.protocolName}{display.phaseName ? ` · ${display.phaseName}` : ''}
  </span>
</div>
```

### Step GO

- **Pas de flash plein écran** (trop violent). Affichage sobre centré dans le layout normal.
- "GO !" en grand (`6rem`, `fontWeight: 900`, couleur `#f43f5e`).
- Protocole en petite caption au-dessus, "Apnée" en sous-titre discret en dessous.
- `paddingTop: '4rem'`, `minHeight: '60vh'` pour centrer visuellement.

```tsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '1.5rem', minHeight: '60vh', paddingTop: '4rem' }}>
  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
    {display.protocolName}
  </p>
  <p style={{ fontFamily: 'monospace', fontSize: '6rem', fontWeight: 900, color: '#f43f5e' }}>
    GO !
  </p>
  <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
    Apnée
  </p>
</div>
```

### Espacement général WarmupView

- Conteneur principal : `gap: '4'` (gap-4 Tailwind, ou `gap: '1rem'` inline), `paddingTop: '2rem'` (pt-8).
- Séparation visuelle claire avec la ligne de widgets au-dessus.

---

## Couleurs des types d'étape (`STEP_VISUAL`)

| Type       | Couleur     | Label         |
|------------|-------------|---------------|
| `breathe`  | `#2dd4bf`   | Respiration   |
| `hold`     | `#818cf8`   | Rétention     |
| `recovery` | `#4ade80`   | Récupération  |
| `inhale`   | `#a78bfa`   | Inspiration   |
| `exhale`   | `#34d399`   | Expiration    |
| `co2`      | `#fb923c`   | CO₂           |
| `go`       | `#f43f5e`   | GO !          |

---

## Son dans le warmup

- `AudioContext` créé **sur le geste utilisateur** (au clic "Démarrer l'échauffement").
- Changement d'étape → bip **440 Hz** + voix lit `step.instruction`.
- Step `go` → bip **880 Hz** + voix dit "Apnée".
- Décompte 3/2/1 → bips **660 Hz** discrets.
- Nettoyage (`cancelWarmupSound()` + `AudioContext.close()`) sur : skip total, annulation, démontage.
- Voix via `useVoiceGuideStore.getState()` — respecte les réglages Sons/Rivière/Voix de l'utilisateur.

---

## Widgets persistants

| Widget          | Persistance   | Éditable | Couleur           |
|-----------------|---------------|----------|-------------------|
| Best session    | Dexie (auto)  | Non      | `text-white/70`   |
| Personal best   | localStorage  | Oui      | `text-accent`     |
| Base setup      | localStorage  | Oui      | `text-white/70`   |

- **Base setup** : valeur de référence apnée de base — servira à auto-générer des exercices.
- Parser les inputs : format `M:SS` ou secondes décimales, via `parsePbInput()`.

---

## Timing

- Toujours **wall-clock** (`Date.now()`), jamais `setInterval` ni accumulation RAF.
- `rafRef` : un seul RAF actif à la fois — toujours `cancelAnimationFrame(rafRef.current)` avant d'en créer un nouveau.
- `skipWarmupStep` : avance `warmupStartMsRef.current` du temps restant sur l'étape courante — le RAF tick saute naturellement à l'étape suivante au prochain frame.
