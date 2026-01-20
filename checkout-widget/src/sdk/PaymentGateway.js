import { createModal, removeModal } from './modal';
import './styles.css';

class PaymentGateway {
  constructor(options) {
    // 1. Validate required options
    if (!options || !options.key || !options.orderId) {
      throw new Error('PaymentGateway: key and orderId are required');
    }

    // 2. Store configuration
    this.key = options.key;
    this.orderId = options.orderId;
    this.onSuccess = options.onSuccess || function () {};
    this.onFailure = options.onFailure || function () {};
    this.onClose = options.onClose || function () {};

    this.modal = null;
    this.messageListener = this.handleMessage.bind(this);
  }

  open() {
    // 1. Create modal overlay + iframe
    this.modal = createModal(this.key, this.orderId);

    // 2. Append modal to document body
    document.body.appendChild(this.modal);

    // 3. Set up postMessage listener for iframe communication
    window.addEventListener('message', this.messageListener);

    // 4. Show modal
    this.modal.style.display = 'block';
  }

  close() {
    // 1. Remove modal from DOM
    if (this.modal) {
      removeModal(this.modal);
      this.modal = null;
    }

    // 2. Remove message listener
    window.removeEventListener('message', this.messageListener);

    // 3. Call onClose callback
    this.onClose();
  }

  handleMessage(event) {
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'payment_success') {
      this.onSuccess(event.data.data);
      this.close();
    } else if (event.data.type === 'payment_failed') {
      this.onFailure(event.data.data);
    } else if (event.data.type === 'close_modal') {
      this.close();
    }
  }
}

// Expose globally
//window.PaymentGateway = PaymentGateway;

export default PaymentGateway;
