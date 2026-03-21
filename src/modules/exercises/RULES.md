# Règles du module `exercises`

---

## ⚠️ Règle critique — Tailwind JIT

**Tous les fichiers de ce module sont affectés par le bug JIT de Vite/Tailwind.**
Les classes de spacing (`px-*`, `pt-*`, `pb-*`, `gap-*`) peuvent ne pas compiler sur les fichiers créés ou modifiés après le scan initial.

**Règle absolue : toujours utiliser des inline styles pour le spacing.**

```tsx
// ❌ Ne pas faire — peut produire 0px au runtime
<div className="px-5 pt-3 gap-4">

// ✅ Toujours fiable
<div style={{ padding: '12px 20px', gap: '16px' }}>
```

Valeurs de référence :
| Tailwind  | Inline style       |
|-----------|--------------------|
| `px-4`    | `paddingLeft/Right: '16px'` ou `padding: '0 16px'` |
| `px-5`    | `paddingLeft/Right: '20px'` ou `padding: '0 20px'` |
| `pt-1`    | `paddingTop: '4px'`  |
| `pt-3`    | `paddingTop: '12px'` |
| `gap-2`   | `gap: '8px'`         |
| `gap-4`   | `gap: '16px'`        |

Variables CSS à utiliser dans les inline styles :
`var(--color-border)`, `var(--color-border-subtle)`, `var(--color-text-primary)`,
`var(--color-text-secondary)`, `var(--color-text-muted)`, `var(--color-text-inverse)`,
`var(--color-accent)`, `var(--color-bg-surface)`, `var(--color-bg-elevated)`, `var(--color-bg-overlay)`

---

## Format des cartes d'exercice

Toute carte d'exercice **doit** respecter cet ordre immuable :

```
┌─────────────────────────────────────────┐
│ Nom de l'exercice           ⓘ  ♡        │  ← identité + toggle desc + favori
│ Catégorie  ● ● ● ○ ○                   │  ← méta (catégorie + difficulté)
│ ↑ 5.5s  ⏸ 5.5s  ↓ 5.5s  ○ 5.5s       │  ← phases
│                                         │
│ [Description — masquée par défaut,      │  ← visible seulement si ⓘ actif
│  affichée au clic sur ⓘ]               │
│                                         │
├─────────────────────────────────────────┤
│ ⟳ 14×  ⏱ 5min 8s        Démarrer >    │  ← footer
└─────────────────────────────────────────┘
```

### 1. Nom + bouton ⓘ + favori
- Nom : `text-sm font-semibold text-text-primary`, flush left, tronqué si nécessaire
- Bouton ⓘ (`Info` lucide, size=15) : affiché uniquement si `exercise.description && !compact`
  - couleur `text-accent` quand actif, `text-text-muted` sinon
  - `onClick={() => setShowDesc(v => !v)}`
- Bouton ♡ (`Heart` lucide, size=15) : favori, toujours présent
- Les deux boutons dans un `flex items-center flex-shrink-0` avec `gap: '4px'`

### 2. Catégorie (`CategoryBadge`)
- Alignée flush-left sous le nom — **aucun** `px-*`, `rounded-full`, ni `bg-*`
- Uniquement la classe couleur texte (ex: `text-blue-400`)

### 3. Phases (`PhasePills`)
- Icône + durée par phase, en pills

### 4. Description (toggleable)
- Masquée par défaut (`showDesc = false`)
- Rendue uniquement si `showDesc && exercise.description`
- Jamais de `line-clamp` ni de troncature
- `\n\n` → paragraphes `<p>` séparés avec `style={{ gap: '8px' }}`
- `\n` → `<br />`
- `style={{ lineHeight: '1.7' }}` sur chaque paragraphe

### 5. Footer
- `border-t border-border-subtle` + `style={{ paddingTop: '14px' }}` (inline obligatoire)
- Gauche : `ExerciseMeta` (répétitions + durée totale)
- Droite : boutons Modifier + Supprimer (si non-preset) + bouton **Démarrer** accent

### Composants partagés (`card/parts/`)

| Composant        | Props                         | Rôle                            |
|------------------|-------------------------------|---------------------------------|
| `CategoryBadge`  | `category`                    | Label coloré flush-left         |
| `DifficultyDots` | `level` (1–5)                 | 5 dots remplis jusqu'à `level`  |
| `PhasePills`     | `phases: Phase[]`             | Pills icône + durée             |
| `ExerciseMeta`   | `repetitions`, `totalSeconds` | Résumé ⟳ N× ⏱ Xmin Ys          |

---

## SessionConfigSheet

### Rendu
- Via `createPortal(content, document.body)`
- Padding horizontal : **inline style uniquement** — `style={{ padding: '0 20px' }}` (pas `px-5`)

### Architecture overlay (bug Chrome `backdrop-filter`)
`backdrop-filter: blur` intercepte les clics même derrière d'autres éléments. Toujours deux couches séparées :

```tsx
{/* Couche blur — pointer-events:none */}
<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
  className="bg-black/60 backdrop-blur-sm" />
{/* Couche cliquable */}
<div style={{ position: 'absolute', inset: 0, zIndex: 1 }} onClick={onClose} />
{/* Sheet */}
<div style={{ zIndex: 2 }}>...</div>
```

### Sections (ordre immuable)
1. **Rythme** — `[4s] [5.5s] [6s] [Manuel]` + rangée custom presets en dessous (si existants)
2. **Répétitions** — ligne inline `label | − | N | +` dans un bloc `bg-elevated`, pas de section séparée
3. **Démarrer** — bouton accent pleine largeur avec résumé `Nx · Xmin Xs` intégré

### Compacité (règle de présentation)
- La sheet doit rester discrète : visible sur environ 1/3 bas de l'écran, la liste derrière reste lisible
- Pas de labels de section pour Rythme (implicite) et Répétitions (label dans la ligne)
- Pas de pills de phases en mode symétrique (info déjà visible sur la carte)

### Custom Presets
- Stockés dans `exercise.customPresets: ExercisePreset[]` (IndexedDB, même carte — aucune nouvelle carte créée)
- Créés en mode Manuel → `Sauvegarder comme preset` → saisie nom → `Sauvegarder`
- Chaque preset : bouton sélectionnable + `×` pour supprimer
- Sélectionner un preset restaure ses phases + répétitions (highlight accent)
- Persistance : `saveExercise({ ...exercise, customPresets: updated })` + `getAllExercises()` + `setExercises()`

### Steppers mode Manuel
- Incrément **0.5s**, `clamp(val, 1, 300)`

---

## Types

```typescript
export interface ExercisePreset {
  id: string
  name: string
  phases: Phase[]
  repetitions: number
}

// Dans Exercise :
customPresets?: ExercisePreset[]
```

---

## Mobile
- Padding horizontal AppShell : `px-4` (ou inline si nouveau fichier)
- Sheet : `safe-bottom` + `paddingBottom: '24px'`
- Valider sur viewport 375px
