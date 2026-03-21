# Règles du module `breath-engine`

---

## Rôle du module

Le moteur de respiration est **spécialisé dans l'exécution** : il reçoit les instructions d'un exercice (phases, durées, répétitions) et les exécute avec un timing parfait, en enchaînant graphismes et animations de façon fluide et précise.

Il ne définit pas les exercices. Il ne connaît pas les règles métier. Il exécute.

```
Exercise (instruction)
    ↓  passé par SessionPage → BreathScreen → useBreathSession
BreathClock (timing sample-accurate)
    ↓  callbacks onPhaseChange / onTick / onRepComplete / onSessionComplete
useBreathSession (bridge React)
    ↓  met à jour le Zustand store à 60fps
BreathCircle + ProgressArc + BreathText (graphismes & animations)
    ↓  lisent phaseProgress / internalPhase / remainingSeconds
Rendu visuel synchronisé au timing AudioContext
```

---

## Architecture générale

Le module est découpé en 3 sous-modules indépendants :

| Sous-module | Rôle |
|-------------|------|
| `clock/`    | Timing sample-accurate via `AudioContext` — aucune animation, aucun React |
| `graphics/` | Cercle animé + arc SVG — lisent uniquement `phaseProgress` et `internalPhase` |
| `text/`     | Labels de phase + décompte + compteur rep |

Pont React ↔ Clock : **`useBreathSession` hook uniquement** — `useRef<BreathClock>` + Zustand store + eventBus. Jamais d'import React dans `BreathClock`.

> **Future intégration — module son**
> La `BreathClock` pilotera également le module son : les déclenchements audio (bips, voix guidée, sons de transition) devront être schedulés via `audioCtx.currentTime` directement dans `BreathClock`, pour garantir que le timing sonore soit aligné au sample près avec les phases visuelles. Le module son ne doit **pas** réagir aux callbacks React — il doit être branché sur l'`AudioContext` existant de `BreathClock`.

---

## ⚠️ Règle critique — Tailwind JIT

Même bug que le module `exercises` : les classes de spacing peuvent ne pas compiler.
**Toujours utiliser des inline styles pour tout spacing dans ce module.**

---

## Couleurs des phases

### Tokens CSS (`design-tokens.css`)

```css
--color-phase-inhale:      #38bdf8;  /* Bleu — inspiration */
--color-phase-hold-full:   #38bdf8;  /* Bleu — rétention pleine */
--color-phase-exhale:      #a78bfa;  /* Mauve — expiration */
--color-phase-hold-empty:  #a78bfa;  /* Mauve — rétention vide */
--color-phase-recovery:    #34d399;  /* Vert — récupération */
--color-phase-hold:        #a78bfa;  /* Alias compat event bus (public PhaseType) */
```

### Palette par phase

| Phase interne  | Couleur  | Hex       | Comportement visuel     |
|----------------|----------|-----------|-------------------------|
| `preparation`  | Gris     | `#4a5568` | Statique                |
| `inhale`       | Bleu     | `#38bdf8` | Cercle s'agrandit       |
| `hold-full`    | Bleu     | `#38bdf8` | **Pulse** sinusoïdal    |
| `exhale`       | Mauve    | `#a78bfa` | Cercle se contracte     |
| `hold-empty`   | Mauve    | `#a78bfa` | **Pulse** sinusoïdal    |
| `recovery`     | Vert     | `#34d399` | Statique                |

### Transitions de couleur

- `BreathCircle` : `transition: 'background 0.8s ease, border-color 0.8s ease'` — fondu CSS sur changement de phase uniquement
- `ProgressArc` : `transition: 'stroke 0.8s ease, filter 0.8s ease'`
- **Ne pas** mettre `box-shadow` dans la transition — il est piloté par rAF frame par frame

---

## `InternalPhaseType` vs `PhaseType`

```typescript
// Public — event bus
type PhaseType = 'inhale' | 'hold' | 'exhale' | 'recovery'

// Interne — breath-engine uniquement
type InternalPhaseType = 'preparation' | 'inhale' | 'hold-full' | 'hold-empty' | 'exhale' | 'recovery'
```

`hold-full` = rétention après inhale. `hold-empty` = rétention après exhale.
Résolution dans `BreathClock.buildSchedule()` via `resolveInternalType(phase, prevPublicType)`.

---

## Durées des phases — règle fondamentale

**Les durées de chaque phase dépendent exclusivement des réglages de l'exercice.**
Le moteur ne connaît et n'impose aucune durée. Il lit toujours `phase.durationSeconds` depuis l'objet `Exercise` passé à `BreathClock.start(exercise)`.

```
SessionConfigSheet (4s / 5.5s / 6s / Manuel)
        ↓ modifie exercise.phases[i].durationSeconds
BreathClock.buildSchedule(exercise)
        ↓ lit phase.durationSeconds pour chaque ScheduledPhase
rAF loop → phaseProgress = elapsed / phase.durationSeconds
```

- Le preset Box Breathing utilise 5.5s par défaut, mais l'utilisateur peut choisir 4s, 6s ou une valeur manuelle.
- Un exercice custom peut avoir des durées différentes par phase (ex: inhale 4s, hold 7s, exhale 8s).
- **Ne jamais hardcoder une durée dans le moteur graphique ou textuel** — toujours passer par `phaseProgress` (0→1) normalisé par le clock.

---

## Preset d'exercice — règle sur le type des phases

La phase rétention vide doit avoir `type: 'hold'` (pas `'recovery'`) pour être correctement résolue en `hold-empty` par `resolveInternalType` :

```typescript
// ✅ Correct — résolu en hold-empty (mauve pulse)
{ type: 'hold', durationSeconds: X, label: 'Détends la cage thoracique' }

// ❌ Incorrect — résolu en recovery (vert) au lieu de mauve
{ type: 'recovery', durationSeconds: X, label: '...' }
```

---

## `BreathCircle` — animations

```typescript
// Glow rAF-driven :
// — phases actives : glow = 8 + phaseProgress * 28
// — phases hold : glow sinusoïdal, période 3s
const pulse = 0.5 + 0.5 * Math.sin((Date.now() / 1500) * Math.PI)
glow = 10 + pulse * 30

// Scale :
scale = scaleFrom + (scaleTo - scaleFrom) * phaseProgress

// Remplissage visible (opacités) :
background: `radial-gradient(circle at center, ${hex}cc 0%, ${hex}55 50%, ${hex}11 80%, transparent 100%)`
border: `2px solid ${hex}dd`
boxShadow: `0 0 ${glow}px ${hex}99, 0 0 ${glow * 2}px ${hex}44`
```

Les hex sont utilisés directement (pas les CSS vars) pour permettre la construction des chaînes avec opacité suffixée.

---

## `ProgressArc` — arc SVG

- `internalPhase` (pas `phase`) pour distinguer `hold-full` (bleu) de `hold-empty` (mauve)
- `strokeDashoffset = CIRCUMFERENCE * (1 - phaseProgress)` — se remplit 0→100% par phase
- `filter: drop-shadow` pour le glow de l'arc
- `transform: rotate(-90deg)` — départ à 12h

---

## `BreathClock` — timing

- `new AudioContext()` dans le constructeur
- `audioCtx.resume()` au `start()` (autoplay policy iOS)
- Toutes les phases pré-schedulées à `start()` avec `audioCtx.currentTime` absolu
- rAF loop : `findPhaseIndex(now)` → callbacks → `requestAnimationFrame(tick)`
- **Pause** : `audioCtx.suspend()` + cancel rAF + sauvegarde `pausedAt`
- **Resume** : patch toutes les `startTime/endTime` futures de `suspendDuration`, `audioCtx.resume()` + restart rAF

---

## `useBreathSession` — bridge React

- `useRef<BreathClock>` — persiste entre renders sans déclencher re-render
- `start(exercise)` : crée clock, `store.startSession()`, `await clock.start(exercise)`, émet `SESSION_STARTED`
- Phase préparation (repIndex = -1) : **ne pas** émettre `PHASE_CHANGED` sur l'event bus
- `useEffect` cleanup unmount : `clockRef.current?.stop()`

---

## `BreathScreen` — layout

- `position: fixed, inset: 0, zIndex: 50` — full-screen, échappe l'AppShell
- `useEffect` mount → `void start(exercise)`, cleanup → `stop()`
- Ordre vertical : bouton ×, `BreathVisual`, `BreathText`, bouton Pause/Resume
