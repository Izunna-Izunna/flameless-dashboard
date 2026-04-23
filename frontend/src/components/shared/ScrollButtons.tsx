/**
 * Floating ▲ / ▼ buttons that scroll the nearest .touch-scroll container.
 * window.scrollBy won't work because the page itself doesn't scroll —
 * only the inner panel does.
 */

const SCROLL_AMOUNT = 120 // px per tap

function scrollPanel(direction: 1 | -1) {
  const el = document.querySelector<HTMLElement>('.touch-scroll')
  if (el) el.scrollBy({ top: direction * SCROLL_AMOUNT, behavior: 'smooth' })
}

export default function ScrollButtons() {
  return (
    <div className="scroll-buttons">
      <button className="scroll-btn" onClick={() => scrollPanel(-1)} aria-label="Scroll up">▲</button>
      <button className="scroll-btn" onClick={() => scrollPanel(1)}  aria-label="Scroll down">▼</button>
    </div>
  )
}
