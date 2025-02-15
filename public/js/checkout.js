const BASE_URL = "https://ram-resume.duckdns.org";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector(".pay-now").addEventListener("click", initiatePayment);
});

async function initiatePayment() {
  try {
    const totalAmount = parseInt(document.getElementById("total-amount").innerText, 10);

    if (totalAmount <= 0) {
      alert("Your cart is empty!");
      return;
    }

    // Request the backend to create an order
    const response = await fetch(`${BASE_URL}/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: totalAmount }),
    });

    const order = await response.json();

    if (!order || !order.id) {
      throw new Error("Failed to create order");
    }

    const options = {
      key: order.key_id, // Fetch key from backend for security
      amount: order.amount,
      currency: "INR",
      name: "Canteen",
      description: "Order Payment",
      order_id: order.id,
      handler: async function (response) {
        try {
          // Verify payment with the backend
          const verifyRes = await fetch(`${BASE_URL}/verify-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            alert("Payment Successful! Payment ID: " + response.razorpay_payment_id);
            document.getElementById("bill").style.display = "block";
            document.getElementById("bill-total").innerText = totalAmount;
          } else {
            throw new Error("Payment verification failed.");
          }
        } catch (err) {
          console.error("Verification error:", err);
          alert("Payment verification failed.");
        }
      },
      prefill: {
        name: "Customer",
        email: "customer@example.com",
        contact: "9999999999",
      },
      theme: { color: "#28a745" },
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (error) {
    console.error("Payment error:", error);
    alert("Payment failed. Try again.");
  }
}
