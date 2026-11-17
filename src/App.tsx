import { useModal } from 'connectkit'
import { ActionBar } from '@/components/ActionBar'
import { Confetti } from '@/components/Confetti'
import { Grid } from '@/components/Grid'
import { Header } from '@/components/Header'
import { OwnerPanel } from '@/components/OwnerPanel'
import { usePool } from '@/hooks/usePool'
import { ResultSheet } from '@/components/ResultSheet'
import { Stats } from '@/components/Stats'
import { Winners } from '@/components/Winners'
import { useGame } from '@/hooks/useGame'
import { useRecentWinners } from '@/hooks/useRecentWinners'
import { GAME_ADDRESS } from '@/lib/game'

export default function App() {
  const game = useGame()
  const feed = useRecentWinners()
  const { setOpen } = useModal()

  const deployed = Boolean(GAME_ADDRESS)
  const busy = game.busy !== null
  // Boxes lock while a transaction is in flight or a box is already waiting for its reveal.
  const pool = usePool()
  const gridDisabled = !deployed || busy || game.pending !== null || pool.low

  const onPick = (box: number) => {
    if (!game.isConnected) return setOpen(true)
    if (game.wrongChain) return void game.switchToGameChain()
    if (!game.canAfford) return
    void game.open(box)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          style={{
            position: 'absolute',
            top: '6%',
            left: '-4%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.24) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '6%',
            right: '-2%',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.22) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
        <Header />

        <main>
          <Stats balance={game.balance} />

          <section aria-label="Game board" className="glass-card mt-4 rounded-[32px] p-4 sm:p-5">
            <Grid
              opened={game.opened}
              lockedBox={game.pending ? game.pending.box : null}
              disabled={gridDisabled}
              onPick={onPick}
            />
            <ActionBar
              deployed={deployed}
              isConnected={game.isConnected}
              wrongChain={game.wrongChain}
              canAfford={game.canAfford}
              poolLow={pool.low}
              balanceKnown={game.balance !== undefined}
              pending={game.pending}
              busy={game.busy}
              boardHasResults={Object.keys(game.opened).length > 0}
              onConnect={() => setOpen(true)}
              onSwitch={() => void game.switchToGameChain()}
              onReveal={() => void game.reveal()}
              onResetBoard={game.resetBoard}
            />
          </section>

          {pool.isOwner ? <OwnerPanel available={pool.available} onDone={() => void pool.refetchAvailable()} /> : null}

          <Winners winners={feed.winners} loading={feed.loading} failed={feed.failed} />
        </main>
      </div>

      <ResultSheet result={game.result} onClose={game.clearResult} />
      <Confetti burstKey={game.burst} />
    </div>
  )
}
