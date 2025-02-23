document.addEventListener("DOMContentLoaded", function () {
  fetchCartData();
});

// 🛒 Fetch and Display Cart Data
function fetchCartData() {
  fetch("https://ramjob.duckdns.org/api/get-cart")
    .then((res) => res.json())
    .then((data) => {
      let cart = data.cart || [];
      displayCartItems(cart);
    })
    .catch((err) => showError("Error fetching cart: " + err.message));
}

// 🖼 Display Cart Items
function displayCartItems(cart) {
  const cartItemsContainer = document.getElementById("cart-items");
  const totalPriceContainer = document.getElementById("total-price");

  cartItemsContainer.innerHTML = cart.length ? "" : "<p>🛒 Your cart is empty!</p>";

  let totalPrice = 0;

  cart.forEach((item) => {
    const itemElement = document.createElement("div");
    itemElement.classList.add("cart-item");
    itemElement.innerHTML = `
      <img src="${item.image}" alt="${item.name}" class="cart-item-image">
      <div class="cart-item-details">
        <h4>${item.name}</h4>
        <p>${item.price} ₹</p>
      </div>
      <div class="cart-item-quantity">
        <input type="number" value="${item.quantity}" min="1" class="quantity-input" data-id="${item.id}">
        <button class="remove-item" data-id="${item.id}">Remove</button>
      </div>
    `;
    cartItemsContainer.appendChild(itemElement);

    totalPrice += item.price * item.quantity;
  });

  totalPriceContainer.innerHTML = `Total: ${totalPrice} ₹`;
}

// 🛒 Update Cart Quantity
document.addEventListener("input", function (event) {
  if (event.target.classList.contains("quantity-input")) {
    const itemId = event.target.getAttribute("data-id");
    const newQuantity = parseInt(event.target.value);

    fetch("https://ramjob.duckdns.org/api/update-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, quantity: newQuantity }),
    })
      .then((res) => res.json())
      .then((updatedData) => displayCartItems(updatedData.cart))
      .catch((err) => showError("Error updating cart: " + err.message));
  }
});

// ❌ Remove Item from Cart
document.addEventListener("click", function (event) {
  if (event.target.classList.contains("remove-item")) {
    const itemId = event.target.getAttribute("data-id");

    fetch("https://ramjob.duckdns.org/api/update-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, quantity: 0 }),
    })
      .then((res) => res.json())
      .then((updatedData) => displayCartItems(updatedData.cart))
      .catch((err) => showError("Error removing item: " + err.message));
  }
});

// 💳 Handle Checkout
document.getElementById("checkout-button").addEventListener("click", function () {
  fetch("https://ramjob.duckdns.org/api/get-cart")
    .then((res) => res.json())
    .then((data) => {
      const cart = data.cart || [];

      if (cart.length === 0) {
        showError("Your cart is empty!");
        return;
      }

      const checkoutData = {
        items: cart,
        totalPrice: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
      };

      return fetch("https://ramjob.duckdns.org/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutData),
      }).then((res) => res.json());
    })
    .then((data) => {
      if (!data.success) throw new Error("Payment failed");

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: "INR",
        name: "Canteen",
        description: "Order Payment",
        order_id: data.orderId,
        handler: function (response) {
          verifyPayment(response);
        },
        prefill: {
          name: "Customer",
          email: "customer@example.com",
          contact: "9999999999",
        },
        theme: { color: "#3399cc" },
      };

      const rzp = new Razorpay(options);
      rzp.open();
    })
    .catch((err) => showError("Error during checkout: " + err.message));
});

// ✅ Verify Payment
function verifyPayment(response) {
  fetch("https://ramjob.duckdns.org/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("Payment successful!");
        window.location.href = "/order-success";
      } else {
        showError("Payment verification failed.");
      }
    })
    .catch((err) => showError("Error verifying payment: " + err.message));
}

// 🚨 Show Error Messages
function showError(message) {
  alert("❌ " + message);
}
