// Fetch and display orders
let lastOrderCount = 0; // Store the last known number of orders
let pendingOrder = null; // Store order ID and button reference

function showConfirmModal(orderId, button) {
  pendingOrder = { id: orderId, button: button }; // Store order details
  const modal = document.getElementById("confirmModal");

  if (modal) {
    modal.style.display = "flex"; // ✅ Show modal only when button is clicked
  }
}

function closeConfirmModal() {
  const modal = document.getElementById("confirmModal");
  if (modal) {
    modal.style.display = "none"; // ✅ Properly hide the modal
  }
}

async function confirmDelivery() {
  if (!pendingOrder) return;

  try {
    const response = await fetch("/update-order-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: pendingOrder.id, status: "DELIVERED" }),
    });

    const data = await response.json();
    if (data.success) {
      // ✅ Change button text and color
      pendingOrder.button.textContent = "Delivered";
      pendingOrder.button.disabled = true;
      pendingOrder.button.classList.add("delivered");

      // ✅ Keep order visible for 5 seconds before refreshing
      setTimeout(() => {
        const orderDiv = pendingOrder.button.closest(".order");
        if (orderDiv) {
          orderDiv.remove();
        }
        loadOrders(); // ✅ Refresh the full list after 5 seconds
      }, 5000);
    } else {
      console.error("Failed to update order:", data.error);
    }
  } catch (error) {
    console.error("Error marking order as delivered:", error);
  } finally {
    closeConfirmModal(); // ✅ Close the modal after confirmation
  }
}

async function loadOrders(autoRefresh = true, updatedOrderId = null) {
  try {
    const response = await fetch("/staff/orders"); // Fetch orders from the server
    const orders = await response.json();
    const ordersList = document.getElementById("orders-list");

    if (!orders.length) {
      ordersList.innerHTML = "<p>No orders available.</p>";
      lastOrderCount = 0; // Reset count if no orders exist
      return;
    }

    // ✅ Refresh only if new orders arrive
    if (autoRefresh && orders.length <= lastOrderCount) return;
    lastOrderCount = orders.length; // Update last order count

    if (updatedOrderId) {
      // ✅ Refresh only the updated order
      const orderDiv = document.querySelector(
        `[data-order-id="${updatedOrderId}"]`
      );
      if (orderDiv) {
        orderDiv.remove();
      }
      return;
    }

    ordersList.innerHTML = ""; // Clear previous content

    orders
      .filter((order) => order.status === "PAID") // Show only paid orders
      .forEach((order) => {
        const filteredItems = Object.entries(order.items)
          .filter(([_, quantity]) => quantity > 0)
          .map(([item, quantity]) => `<p>${item} × ${quantity}</p>`)
          .join("");

        const orderDiv = document.createElement("div");
        orderDiv.className = "order";
        orderDiv.setAttribute("data-order-id", order.orderId);
        orderDiv.innerHTML = `
          <h3>Order ID: ${order.orderId}</h3>
          <p><strong>Amount:</strong> ₹${order.amount}</p>
          <p><strong>Items:</strong> ${
            Object.keys(order.items).filter((item) => order.items[item] > 0)
              .length
          } total</p>
          <p><strong>Time:</strong> ${new Date(
            order.timestamp
          ).toLocaleString()}</p>
          <button class="toggle-btn" onclick="toggleDetails('${
            order.orderId
          }')">Show Details</button>
          <div class="items-list" id="details-${
            order.orderId
          }" style="display:none;">
            <p><strong>Payment ID:</strong> ${order.paymentId}</p>
            ${filteredItems}
          </div>
          <button class="deliver-btn" onclick="showConfirmModal('${
            order.orderId
          }', this)">Mark as Delivered</button>
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
  detailsDiv.style.display =
    detailsDiv.style.display === "none" ? "block" : "none";
}

// ✅ Hide the modal initially on page load
document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  closeConfirmModal(); // Ensure modal is hidden on page load
});

// Refresh orders every 5 seconds
setInterval(() => loadOrders(), 5000);
