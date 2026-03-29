import "phoenix_html"
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"

let Hooks = {}

Hooks.CopyLink = {
  mounted() {
    this.el.addEventListener("click", (e) => {
      e.preventDefault()
      const url = this.el.dataset.url
      if (!url) return
      navigator.clipboard.writeText(url).then(() => {
        const orig = this.el.textContent
        this.el.textContent = "Copied!"
        setTimeout(() => { this.el.textContent = orig }, 2000)
      })
    })
  }
}

let csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
let liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: {_csrf_token: csrfToken},
  hooks: Hooks
})

liveSocket.connect()

window.liveSocket = liveSocket
