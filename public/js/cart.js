      let cart = JSON.parse(sessionStorage.getItem("cart")) || {};
      const prices = { biscuit: 10, meal: 50 };

      function updateCart() {
        let totalAmount = 0;
        let totalItems = 0;

        for (let item in cart) {
          if (cart[item] > 0) {
            totalAmount += cart[item] * prices[item];
            totalItems += cart[item];
          }
        }

        document.getElementById("total-amount").innerText = totalAmount;
        document.getElementById("cart-count").innerText = totalItems;
      }

      function renderCartItems() {
        const cartItemsContainer = document.getElementById("cart-items");
        cartItemsContainer.innerHTML = "";

        for (let item in cart) {
          if (cart[item] > 0) {
            const cartItemElement = document.createElement("div");
            cartItemElement.classList.add("cart-item");
            cartItemElement.innerHTML = `
              <img src="images/${item}.jpg" alt="${item}" /> 
              <p>${item.charAt(0).toUpperCase() + item.slice(1)} - ₹${prices[item]}</p> 
              <div class="quantity"> 
                <button class="quantity-decrease" data-item="${item}">-</button> 
                <span id="${item}-quantity">${cart[item]}</span> 
                <button class="quantity-increase" data-item="${item}">+</button> 
              </div> `
            ;
            cartItemsContainer.appendChild(cartItemElement);
          }
        }
        updateCart();
      }

      document.addEventListener("click", function (event) {
        const item = event.target.getAttribute("data-item");

        if (event.target.classList.contains("quantity-increase")) {
          cart[item] = (cart[item] || 0) + 1;
        } else if (event.target.classList.contains("quantity-decrease") && cart[item] > 0) {
          cart[item]--;
        }

        sessionStorage.setItem("cart", JSON.stringify(cart));
        renderCartItems();
      });

      document.getElementById("pay-now").addEventListener("click", function () {
        let totalAmount = parseInt(document.getElementById("total-amount").innerText);
        if (!totalAmount) {
          alert("Cart is empty!");
          return;
        }

        fetch("/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: totalAmount, cart }),
        })
          .then((res) => res.json())
          .then((order) => {
            if (!order || !order.id) throw new Error("Order creation failed");

            const options = {
              key: "rzp_test_R9tYRWA6Ux3Yhn",
              amount: totalAmount * 100,
              currency: "INR",
              name: "Canteen Payment",
              order_id: order.id,
              handler: function (response) {
                verifyPayment(order.id, response.razorpay_payment_id, response.razorpay_signature);
              },
            };

            const rzp1 = new Razorpay(options);
            rzp1.open();
          })
          .catch((err) => console.error("Error creating order:", err));
      });

      renderCartItems();