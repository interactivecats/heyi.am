import Sortable from "sortablejs"

export default {
  mounted() {
    this.sortable = Sortable.create(this.el, {
      handle: ".pe-drag-handle",
      animation: 150,
      onEnd: () => {
        const ids = Array.from(this.el.querySelectorAll("[data-project-id]"))
          .map(el => el.dataset.projectId)
        this.pushEvent("reorder_projects", { ids })
      }
    })
  },
  destroyed() {
    if (this.sortable) this.sortable.destroy()
  }
}
