import type { AppEvent, EventPayload } from '../types/events.types'

/**
 * Bus d'événements typé — seul canal de communication entre modules.
 *
 * Usage :
 *   eventBus.emit('PHASE_CHANGED', { ... })
 *   const unsub = eventBus.on('PHASE_CHANGED', (payload) => { ... })
 *   unsub() // pour se désabonner
 */
class TypedEventBus {
  private readonly target = new EventTarget()

  emit<T extends AppEvent['type']>(type: T, payload: EventPayload<T>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.target.dispatchEvent(new CustomEvent(type, { detail: payload as any }))
  }

  on<T extends AppEvent['type']>(
    type: T,
    handler: (payload: EventPayload<T>) => void,
  ): () => void {
    const listener = (e: Event) =>
      handler((e as CustomEvent<EventPayload<T>>).detail)
    this.target.addEventListener(type, listener)
    return () => this.target.removeEventListener(type, listener)
  }

  /** S'abonner à plusieurs types en une fois — retourne une fonction de cleanup globale */
  onMany<T extends AppEvent['type']>(
    subscriptions: {
      [K in T]: (payload: EventPayload<K>) => void
    },
  ): () => void {
    const unsubs = (Object.entries(subscriptions) as [T, (p: EventPayload<T>) => void][]).map(
      ([type, handler]) => this.on(type, handler),
    )
    return () => unsubs.forEach((u) => u())
  }
}

/** Singleton global — importer depuis n'importe quel module */
export const eventBus = new TypedEventBus()
