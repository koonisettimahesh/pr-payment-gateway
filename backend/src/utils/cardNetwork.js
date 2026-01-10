export function detectCardNetwork(cardNumber) {
  const num = cardNumber.replace(/[\s-]/g, "");

  if (num.startsWith("4")) return "visa";

  const firstTwo = parseInt(num.slice(0, 2), 10);
  if (firstTwo >= 51 && firstTwo <= 55) return "mastercard";

  if (num.startsWith("34") || num.startsWith("37")) return "amex";

  if (
    num.startsWith("60") ||
    num.startsWith("65") ||
    (firstTwo >= 81 && firstTwo <= 89)
  ) {
    return "rupay";
  }

  return "unknown";
}
