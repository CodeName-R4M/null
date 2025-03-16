// Fetch and display orders
async function loadOrders() {
  try {
    const response = await fetch("/staff/orders");
    const orders = await response.json();
    const ordersList = document.getElementById("orders-list");
    ordersList.innerHTML = "";

    orders.filter(order => order.status === "PAID").forEach((order) => {
      // Filter out items with quantity 0
      const filteredItems = Object.entries(order.items)
        .filter(([_, quantity]) => quantity > 0)
        .map(([item, quantity]) => `<p>${item} × ${quantity}</p>`)
        .join("");

      // Create order div
      const orderDiv = document.createElement("div");
      orderDiv.className = "order";
      orderDiv.innerHTML = `
        <h3>Order ID: ${order.orderId}</h3>
        <p><strong>Amount:</strong> ₹${order.amount}</p>
        <p><strong>Items:</strong> ${Object.keys(order.items)
          .filter((item) => order.items[item] > 0)
          .length} total</p>
        <p><strong>Time:</strong> ${new Date(order.timestamp).toLocaleString()}</p>
        <button class="toggle-btn" onclick="toggleDetails('${order.orderId}')">Show Details</button>
        <div class="items-list" id="details-${order.orderId}" style="display:none;">
          <p><strong>Payment ID:</strong> ${order.paymentId}</p>
          ${filteredItems}
        </div>
        <button class="deliver-btn" onclick="markDelivered('${order.orderId}', this)">Mark as Delivered</button>
      `;

      ordersList.appendChild(orderDiv);
    });
  } catch (error) {
    console.error("Error loading orders:", error);
  }
}

// Toggle order details
function toggleDetails(orderId) {
  const detailsDiv = document.getElementById(`details-${orderId}`);
  detailsDiv.style.display = detailsDiv.style.display === "none" ? "block" : "none";
}

// Mark order as delivered
async function markDelivered(orderId, button) {
  try {
    const response = await fetch("/update-order-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status: "DELIVERED" }),
    });

    const data = await response.json();
    if (data.success) {
      button.textContent = "Delivered";
      button.disabled = true;
      button.classList.add("delivered");
    } else {
      console.error("Failed to update order:", data.error);
    }
  } catch (error) {
    console.error("Error marking order as delivered:", error);
  }
}

// Load orders on page load
document.addEventListener("DOMContentLoaded", loadOrders);
