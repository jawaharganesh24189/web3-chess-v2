import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import './App.css'

const getStatus = (game: Chess) => {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White'
    return `Checkmate! ${winner} wins.`
  }
  if (game.isStalemate()) {
    return 'Draw by stalemate.'
  }
  if (game.isThreefoldRepetition()) {
    return 'Draw by repetition.'
  }
  if (game.isInsufficientMaterial()) {
    return 'Draw by insufficient material.'
  }
  if (game.isDraw()) {
    return 'Draw.'
  }
  const side = game.turn() === 'w' ? 'White' : 'Black'
  return game.isCheck() ? `${side} to move (check).` : `${side} to move.`
}

const getBoardWidth = () => {
  if (typeof window === 'undefined') {
    return 480
  }
  const maxWidth = 520
  const minWidth = 280
  const padding = 72
  return Math.min(maxWidth, Math.max(minWidth, window.innerWidth - padding))
}

function App() {
  const [game, setGame] = useState(() => new Chess())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [boardWidth, setBoardWidth] = useState(getBoardWidth())

  useEffect(() => {
    const handleResize = () => {
      setBoardWidth(getBoardWidth())
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [])

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string
      targetSquare: string | null
    }) => {
      if (!targetSquare) {
        return false
      }
      let moveSucceeded = false
      setGame((currentGame) => {
        const updatedGame = new Chess(currentGame.fen())
        if (updatedGame.isGameOver()) {
          return updatedGame
        }
        const move = updatedGame.move({
          from: sourceSquare as Square,
          to: targetSquare as Square,
          promotion: 'q',
        })
        moveSucceeded = Boolean(move)
        return updatedGame
      })
      return moveSucceeded
    },
    [],
  )

  const handleNewGame = useCallback(() => {
    setGame(new Chess())
  }, [])

  const handleUndo = useCallback(() => {
    setGame((currentGame) => {
      const updatedGame = new Chess(currentGame.fen())
      updatedGame.undo()
      return updatedGame
    })
  }, [])

  const toggleOrientation = useCallback(() => {
    setOrientation((current) => (current === 'white' ? 'black' : 'white'))
  }, [])

  const fen = useMemo(() => game.fen(), [game])
  const status = useMemo(() => getStatus(game), [game])
  const history = useMemo(() => game.history(), [game])

  const movePairs = useMemo(() => {
    const pairs: Array<{ turn: number; white: string; black: string }> = []
    for (let moveIndex = 0; moveIndex < history.length; moveIndex += 2) {
      pairs.push({
        turn: moveIndex / 2 + 1,
        white: history[moveIndex],
        black: history[moveIndex + 1] ?? 'N/A',
      })
    }
    return pairs
  }, [history])

  const boardOptions = useMemo(
    () => ({
      position: fen,
      boardOrientation: orientation,
      boardStyle: {
        width: boardWidth,
        height: boardWidth,
      },
      onPieceDrop,
    }),
    [fen, orientation, boardWidth, onPieceDrop],
  )

  return (
    <div className="app">
      <header className="header">
        <p className="eyebrow">Local play · no wallet required</p>
        <h1>Web3 Chess</h1>
        <p className="subtitle">
          Play a local two-player match in your browser. Smart-contract wagering
          lives in the hardhat folder for future integration.
        </p>
      </header>

      <section className="main">
        <div className="board">
          <Chessboard options={boardOptions} />
          <div className="status">
            <span className="label">Status</span>
            <strong>{status}</strong>
          </div>
        </div>

        <aside className="panel">
          <div className="panel-section">
            <h2>Controls</h2>
            <div className="actions">
              <button className="button" type="button" onClick={handleNewGame}>
                New game
              </button>
              <button
                className="button"
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0}
              >
                Undo move
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={toggleOrientation}
              >
                Flip board
              </button>
            </div>
          </div>

          <div className="panel-section">
            <h2>Move list</h2>
            <div className="moves">
              {movePairs.length === 0 ? (
                <p className="muted">Make the first move to start the list.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Turn</th>
                      <th>White</th>
                      <th>Black</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movePairs.map((move) => (
                      <tr key={move.turn}>
                        <td>{move.turn}</td>
                        <td>{move.white}</td>
                        <td>{move.black}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </aside>
      </section>

      <footer className="footer">
        Tip: Drag pieces to move. Promotions auto-queen. No MetaMask needed for
        local play.
      </footer>
    </div>
  )
}

export default App
