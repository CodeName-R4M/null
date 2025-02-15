const BASE_URL = "https://ram-resume.duckdns.org"; // Backend URL

document.addEventListener("DOMContentLoaded", () => {
  fetchCart();
});

// 🛒 Fetch Cart Items
function fetchCart() {
  fetch(`${BASE_URL}/cart`)
    .then((res) => res.json())
    .then((cart) => {
      updateCartUI(cart);
    })
    .catch((err) => showError("Error fetching cart: " + err.message));
}

// 🛍 Update Cart Items
function updateCart(item, change) {
  fetch(`${BASE_URL}/cart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item, change }),
  })
    .then((res) => res.json())
    .then((cart) => {
      updateCartUI(cart);
    })
    .catch((err) => showError("Error updating cart: " + err.message));
}

// 🔄 Update Cart UI
function updateCartUI(cart) {
  Object.keys(cart).forEach((item) => {
    let countElement = document.getElementById(`${item}-count`);
    if (countElement) countElement.textContent = cart[item] || 0;
  });

  updateCartCount(cart);
  updateTotalAmount(cart);
}

// 🏷️ Update Cart Item Count
function updateCartCount(cart) {
  let totalCount = Object.values(cart).reduce((acc, val) => acc + (val || 0), 0);
  document.getElementById("cart-count").textContent = totalCount;
}

// 💰 Update Total Amount
function updateTotalAmount(cart) {
  let total = calculateTotal(cart);
  document.getElementById("total-amount").textContent = `₹ ${total}`;
}

// ⚡ Calculate Total Price
function calculateTotal(cart) {
  return (cart.biscuit || 0) * 10 + (cart.meal || 0) * 50;
}

// 💳 Initiate Payment
function initiatePayment() {
  fetch(`${BASE_URL}/cart`)
    .then((res) => res.json())
    .then((cart) => {
      let totalAmount = calculateTotal(cart);
      if (totalAmount <= 0) {
        showError("⚠️ Cart is empty. Add items before proceeding to payment.");
        return;
      }

      return fetch(`${BASE_URL}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: totalAmount, cart }),
      });
    })
    .then((res) => res.json())
    .then((order) => {
      if (!order || !order.id) throw new Error("Invalid order response.");

      const userName = localStorage.getItem("userName") || "Customer";
      const userEmail = localStorage.getItem("userEmail") || "customer@example.com";
      const userPhone = localStorage.getItem("userPhone") || "9999999999";

      const options = {
        key: order.key_id, // ✅ Dynamic key_id
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Canteen",
        description: "Order Payment",
        order_id: order.id,
        handler: function (response) {
          console.log("✅ Payment Success:", response);
          verifyPayment(order.id, response.razorpay_payment_id, response.razorpay_signature);
        },
        prefill: { name: userName, email: userEmail, contact: userPhone },
        theme: { color: "#3399cc" },
      };
      const rzp = new Razorpay(options);
      rzp.open();
    })
    .catch((err) => showError("Error initiating payment: " + err.message));
}

// ✅ Verify Payment
function verifyPayment(orderId, paymentId, signature) {
  fetch(`${BASE_URL}/verify-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("✅ Verification Success:", data);
      if (data.success) {
        window.location.href = `/payment-status.html?status=success&order_id=${orderId}&payment_id=${paymentId}&amount=${data.amount}&items=${encodeURIComponent(JSON.stringify(data.items))}`;
      } else {
        showError("⚠️ Payment verification failed.");
        window.location.href = `/payment-status.html?status=failure`;
      }
    })
    .catch((err) => showError("Error verifying payment: " + err.message));
}

// 🚨 Show Error Messages
function showError(message) {
  alert("❌ " + message);
}
