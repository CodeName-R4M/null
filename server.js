const express = require("express");
const Razorpay = require("razorpay");
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const cors = require("cors");
app.use(cors());

// ✅ Secure Sessions with Persistent Cart & Menu, Session Timeout after 30 mins
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // make sure this is set properly
      sameSite: "None",
      maxAge: 30 * 60 * 1000, // Set session timeout to 30 minutes
    },
  })
);

// ✅ Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Middleware to Initialize Session Data
app.use((req, res, next) => {
  // Reset session if inactive for more than 30 minutes
  if (
    req.session.lastAccess &&
    Date.now() - req.session.lastAccess > 30 * 60 * 1000
  ) {
    req.session.destroy((err) => {
      if (err) console.log("Error destroying session:", err);
    });
  }
  req.session.lastAccess = Date.now(); // Update last access time

  if (!req.session.menu) {
    req.session.menu = {
      biscuit: { name: "Biscuit", price: 10, image: "images/biscuit.jpg" },
      meal: { name: "Meal", price: 50, image: "images/meal.jpg" },
    };
  }
  if (!req.session.cart) req.session.cart = {};
  if (!req.session.paymentStatus)
    req.session.paymentStatus = {
      status: "NOT_STARTED",
      orderId: null,
      paymentId: null,
      amount: 0,
      items: {},
    };
  next();
});

// 📜 **Serve Pages**
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/cart.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "cart.html"))
);
app.get("/payment-status.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "payment-status.html"))
);
app.get("/xadminx", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);

// 🛒 **Cart APIs**
app.get("/cart", (req, res) => res.json(req.session.cart));

app.post("/cart", (req, res) => {
  const { item, change } = req.body;
  if (!req.session.menu[item]) {
    return res.status(400).json({ error: "Item not found" });
  }
  req.session.cart[item] = Math.max(0, (req.session.cart[item] || 0) + change);
  res.json(req.session.cart);
});

// 📌 **Fix for 404 Error - Item Prices API**
app.get("/item-prices", (req, res) => {
  const prices = {};
  Object.keys(req.session.menu).forEach((key) => {
    prices[key] = req.session.menu[key].price;
  });
  res.json(prices);
});

// 🏪 **Admin APIs**
app.get("/admin/menu", (req, res) => {
  console.log("🔍 Debug: Menu Data Sent:", req.session.menu);
  res.json(req.session.menu);
});

app.post("/admin/add-item", (req, res) => {
  const { id, name, price, image } = req.body;
  if (!id || !name || !price || !image)
    return res.status(400).json({ error: "Missing fields" });

  req.session.menu[id] = { name, price, image };
  console.log("✅ Item Added:", req.session.menu[id]);
  res.json(req.session.menu);
});

app.post("/admin/remove-item", (req, res) => {
  const { id } = req.body;
  if (!req.session.menu[id])
    return res.status(404).json({ error: "Item not found" });

  delete req.session.menu[id];
  delete req.session.cart[id];
  console.log("❌ Item Removed:", id);
  res.json(req.session.menu);
});

// 🛍 **Create Razorpay Order**
app.post("/create-order", async (req, res) => {
  try {
    const { amount, cart } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid order amount" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects amount in paise
      currency: "INR",
      receipt: `order_${Date.now()}`,
    });
    const orderTime = new Date().toISOString();
    req.session.paymentStatus = {
      orderId: order.id,
      status: "PENDING",
      amount,
      items: cart,
      timestamp: orderTime,
    };

    res.json({
      id: order.id,
      amount: order.amount,
      key_id: process.env.RAZORPAY_KEY_ID,
      timestamp: orderTime,
    });
  } catch (error) {
    console.error("❌ Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});
// 🛍 **Checkout API**
app.post("/checkout", async (req, res) => {
  try {
    const { items, totalPrice } = req.body;

    if (!items || !totalPrice || totalPrice <= 0) {
      return res.status(400).json({ error: "Invalid checkout data" });
    }

    // Create a Razorpay order
    const order = await razorpay.orders.create({
      amount: totalPrice * 100, // Razorpay expects amount in paise
      currency: "INR",
      receipt: `order_${Date.now()}`,
    });

    // Save the order details in the session
    req.session.paymentStatus = {
      orderId: order.id,
      status: "PENDING",
      amount: totalPrice,
      items: items,
    };

    // Return the order details to the frontend
    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("❌ Error during checkout:", error);
    res.status(500).json({ error: "Checkout failed" });
  }
});
// 💳 **Verify Razorpay Payment**
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
      console.log("🛠️ Stored Order ID:", req.session.paymentStatus.orderId);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      req.session.paymentStatus = {
        orderId: razorpay_order_id,
        status: "FAILED",
      };
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    req.session.paymentStatus = {
      orderId: razorpay_order_id,
      status: "SUCCESS",
      paymentId: razorpay_payment_id,
      amount: req.session.paymentStatus.amount || 0,
      items: req.session.paymentStatus.items || {},
    };

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// 🔍 **Get Payment Status**
app.get("/payment-status", (req, res) =>
  res.json(req.session.paymentStatus || { status: "NOT_FOUND" })
);

// 🚀 **Start Server**
const PORT = process.env.PORT || 6900;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
