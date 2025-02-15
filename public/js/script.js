const BASE_URL = "https://ram-resume.duckdns.org"; // Change this if running locally

document.addEventListener("DOMContentLoaded", () => {
    fetchCart();

    document.getElementById("cart-icon").addEventListener("click", () => {
        window.location.href = "/cart.html";
    });
});

function fetchCart() {
    fetch(`${BASE_URL}/cart`)
        .then(res => {
            if (!res.ok) throw new Error("Failed to fetch cart data");
            return res.json();
        })
        .then(data => {
            Object.keys(data).forEach(item => {
                let countElement = document.getElementById(`${item}-count`);
                if (countElement) countElement.textContent = data[item] || 0;
            });
            updateCartCount(data);
        })
        .catch(err => console.error("Error fetching cart:", err));
}

function updateCart(item, change) {
    fetch(`${BASE_URL}/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, change })
    })
        .then(res => {
            if (!res.ok) throw new Error("Failed to update cart");
            return res.json();
        })
        .then(data => {
            let countElement = document.getElementById(`${item}-count`);
            if (countElement) countElement.textContent = data[item] || 0;
            updateCartCount(data);
        })
        .catch(err => console.error("Error updating cart:", err));
}

function updateCartCount(cart) {
    let totalCount = Object.values(cart).reduce((acc, val) => acc + (val || 0), 0);
    document.getElementById("cart-count").textContent = totalCount;
}
