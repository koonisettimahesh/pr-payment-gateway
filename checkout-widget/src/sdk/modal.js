export function createModal(key, orderId) {
  const modal = document.createElement("div");
  modal.id = "payment-gateway-modal";
  modal.setAttribute("data-test-id", "payment-modal");

  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <iframe
          data-test-id="payment-iframe"
          src="http://localhost:3001/checkout?order_id=${encodeURIComponent(
            orderId,
          )}&embedded=true&key=${encodeURIComponent(key)}"

          frameborder="0"
        ></iframe>
        <button
          data-test-id="close-modal-button"
          class="close-button"
          type="button"
        >
          x
        </button>
      </div>
    </div>
  `;

  // Close button handler
  const closeBtn = modal.querySelector('[data-test-id="close-modal-button"]');
  closeBtn.addEventListener("click", () => {
    window.postMessage({ type: "close_modal" }, "*");
  });

  return modal;
}

export function removeModal(modal) {
  if (modal && modal.parentNode) {
    modal.parentNode.removeChild(modal);
  }
}
