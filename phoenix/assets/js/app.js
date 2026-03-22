import "phoenix_html"
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import { mount as mountWorkTimeline } from "./islands/work-timeline"

// ── Sortable Hook ──────────────────────────────────────────────
// Attaches to a container element. Children with [data-sort-id]
// become draggable. On drop, pushes "reorder" event with the
// new ordered list of IDs to the LiveView.
const Sortable = {
  mounted() {
    this.el.addEventListener("dragstart", (e) => {
      const item = e.target.closest("[data-sort-id]")
      if (!item) return
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", item.dataset.sortId)
      item.classList.add("dragging")
    })

    this.el.addEventListener("dragend", (e) => {
      const item = e.target.closest("[data-sort-id]")
      if (item) item.classList.remove("dragging")
    })

    this.el.addEventListener("dragover", (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"

      const dragging = this.el.querySelector(".dragging")
      if (!dragging) return

      const siblings = [...this.el.querySelectorAll("[data-sort-id]:not(.dragging)")]
      const next = siblings.find((el) => {
        const rect = el.getBoundingClientRect()
        return e.clientY < rect.top + rect.height / 2
      })

      if (next) {
        this.el.insertBefore(dragging, next)
      } else {
        this.el.appendChild(dragging)
      }
    })

    this.el.addEventListener("drop", (e) => {
      e.preventDefault()
      const ids = [...this.el.querySelectorAll("[data-sort-id]")]
        .map((el) => el.dataset.sortId)
      this.pushEvent("reorder", {ids: ids})
    })
  }
}

let Hooks = {Sortable}

let csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
let liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: {_csrf_token: csrfToken},
  hooks: Hooks
})

liveSocket.connect()

window.liveSocket = liveSocket

// Mount React islands
mountWorkTimeline()
