interface Props {
  level: number
}

export function DifficultyDots({ level }: Props) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i <= level ? 'bg-accent' : 'bg-bg-overlay'
          }`}
        />
      ))}
    </div>
  )
}
