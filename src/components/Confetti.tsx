import { useEffect, useRef } from 'react'

const COLORS = ['#5fbeff', '#af8ff4', '#f05c6b', '#ffcd83', '#7ef1b3', '#122d45']

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vr: number
  color: string
}

/** Full-screen canvas burst. Renders nothing when the visitor prefers reduced motion. */
export function Confetti({ burstKey }: { burstKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (burstKey === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return

    const dpr = window.devicePixelRatio || 1
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    g.scale(dpr, dpr)

    const pieces: Piece[] = Array.from({ length: 110 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      const speed = 8 + Math.random() * 9
      return {
        x: width / 2,
        y: height * 0.55,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }
    })

    const clock = { frame: 0, raf: 0 }
    const tick = () => {
      clock.frame += 1
      g.clearRect(0, 0, width, height)
      for (const p of pieces) {
        p.vy += 0.32
        p.vx *= 0.992
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        g.save()
        g.translate(p.x, p.y)
        g.rotate(p.rot)
        g.globalAlpha = Math.max(0, 1 - clock.frame / 130)
        g.fillStyle = p.color
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        g.restore()
      }
      if (clock.frame < 130) {
        clock.raf = requestAnimationFrame(tick)
      } else {
        g.clearRect(0, 0, width, height)
      }
    }
    clock.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(clock.raf)
  }, [burstKey])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />
}
