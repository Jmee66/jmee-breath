# CLAUDE.md — Règles d'architecture apnea-pwa

## Principe fondamental

Cette application est construite sur des **modules autonomes et composables**.
Chaque module expose une API claire. Les pages/features **orchestrent** ces modules,
elles ne les re-implémentent jamais.

> Toute violation de ce principe crée de la désynchronisation, de la dette technique
> et des bugs impossibles à reproduire. C'est la leçon des rewrites passés.

---

## Checklist OBLIGATOIRE avant d'écrire du code

Avant d'implémenter quoi que ce soit, je dois répondre à ces questions :

1. **Est-ce qu'un module existant fait déjà ça ?**
   - Timing / scheduling → `BreathClock`
   - Sons / drones / bol / bip → `soundEngine` (via BreathClock)
   - Ambiance rivière → `riverStore` / `useRiverAmbience`
   - Voix guidée → `voiceGuideStore` / `voice.speak()`
   - État de phase courant → `breathStore`
   - Animation visuelle complète → `BreathVisual` = `ProgressArc` (arc SVG) + `BreathCircle` (disque)
     ⚠️ Ne jamais utiliser `BreathCircle` seul dans une page — toujours `BreathVisual`

2. **Est-ce que je suis en train de recoder un comportement déjà géré ?**
   - Un `setInterval` / `RAF` custom pour le timing → NON, utiliser `BreathClock`
   - Un compteur de phase manuel → NON, utiliser `onPhaseChange`
   - Déclencher des sons manuellement → NON, `BreathClock` les gère via `soundSettings`
   - Animer un cercle manuellement → NON, `BreathCircle` + `breathStore`

3. **Est-ce que je crée plusieurs instances du même module ?**
   - Un seul `BreathClock` actif à la fois par session
   - Une seule source de vérité pour l'état de phase : `breathStore`

---

## Architecture des modules

```
BreathClock  ← source de vérité du TIMING (AudioContext, sample-accurate)
    │
    ├── onPhaseChange(ScheduledPhase)  → breathStore.setPhaseComplete()
    ├── onTick(progress, remainingS)   → breathStore.setProgress/setRemaining
    ├── onRepComplete                  → breathStore (si besoin)
    └── onSessionComplete              → breathStore.endSession()

breathStore (Zustand)  ← source de vérité de l'ÉTAT UI
    │
    ├── BreathCircle          ← lit breathStore, s'anime seul
    ├── VoiceGuide            ← lit breathStore, parle seul
    └── SoundEngine           ← piloté par BreathClock directement

Exercise  ← structure de données UNIQUEMENT
    └── phases[] + repetitions + restBetweenRepsSeconds
```

### Règle de conversion (tables → BreathEngine)

Quand une feature a ses propres "étapes" avec durées variables (ex: tables CO2/O2),
la bonne approche est :
- **Convertir** la structure en un `Exercise` flat (`repetitions: 1`, toutes les phases unrollées)
- **Passer** cet `Exercise` à un unique `BreathClock`
- **Ne jamais** créer un BreathClock par étape / ligne / segment

---

## Modules et leurs responsabilités

| Module | Responsabilité | API principale |
|--------|---------------|----------------|
| `breath-engine` | Timing, sons, état de session | `BreathClock`, `breathStore`, `useBreathEngine` |
| `exercises` | CRUD + types d'exercices | `Exercise`, `ExerciseCategory`, hooks Supabase |
| `apnea-tables` | Tables CO2/O2/custom | `ApneaTable`, `TableEditor`, `TableRunner` |
| `free-timer` | Timer libre sans programme | `FreeTimerPage` |
| `theme` | Layout, nav, son global | `AppShell`, `SideNav`, `GlobalSoundButton` |
| `journal` | Historique sessions | hooks Supabase |
| `voice-guidance` | Synthèse vocale | `voiceGuideStore`, `speak()` |

---

## Anti-patterns interdits

```typescript
// ❌ Re-implémenter le timing
const interval = setInterval(() => { ... }, 100)
requestAnimationFrame(tick)

// ❌ Créer plusieurs BreathClock
rows.forEach(row => new BreathClock(...).start(rowExercise))

// ❌ Déclencher les sons manuellement
audioCtx.createOscillator()  // dans une page ou composant UI

// ❌ Animer le cercle manuellement
setCircleProgress(progress)  // breathStore le fait via BreathClock

// ❌ Dupliquer la logique de phase
if (phase === 'inhale') { ... }  // dans la page au lieu de breathStore/BreathCircle
```

```typescript
// ✅ Un seul BreathClock pour toute la session
const exercise = buildExerciseFromTable(table)  // convertir d'abord
clockRef.current = new BreathClock(callbacks, soundSettings, droneSettings)
void clockRef.current.start(exercise, prepDuration)

// ✅ Laisser BreathCircle s'animer seul
<BreathCircle />  // lit breathStore automatiquement

// ✅ Laisser les sons se déclencher via BreathClock
// soundSettings passés au constructeur, rien à faire dans le composant
```

---

## Avant tout push

### Versioning — OBLIGATOIRE
Incrémenter `version` dans `package.json` à chaque push selon ce schéma :
- **patch** `0.x.Y+1` → bug fix, correction visuelle, refactor sans nouvelle feature
- **minor** `0.X+1.0` → nouvelle feature, nouveau composant, nouveau module
- **major** `X+1.0.0` → rupture d'architecture, refonte complète

Toujours commiter le `package.json` versionné dans le même commit que le code.

### Checklist architecture
- [ ] Aucun `setInterval` / `RAF` custom pour la logique métier
- [ ] Aucun `new BreathClock()` multiple pour une même session
- [ ] Aucun son déclenché manuellement dans un composant UI
- [ ] `BreathVisual` utilisé (jamais `BreathCircle` seul dans une page)
- [ ] Les types de phase (`PhaseType`, `InternalPhaseType`) viennent de `breath-engine`
- [ ] `ExerciseCategory` partagé entre `exercises` et `apnea-tables` (pas de doublon)
- [ ] `package.json` versionné avant le push
