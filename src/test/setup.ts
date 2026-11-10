import '@testing-library/jest-dom/vitest'

const dialogOpeners = new WeakMap<HTMLDialogElement, HTMLElement>()
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    if (document.activeElement instanceof HTMLElement) dialogOpeners.set(this, document.activeElement)
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    dialogOpeners.get(this)?.focus()
  }
}
