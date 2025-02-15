const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://ram-resume.duckdns.org", credentials: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session Middleware
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Change to `true` if using HTTPS
  })
);

// Razorpay Setup
const razorpay = new Razorpay({
  key_id: "rzp_test_R9tYRWA6Ux3Yhn",
  key_secret: "kjE0klTO7pualBngHwe80VLb",
});

// Initialize Session Variables
app.use((req, res, next) => {
  if (!req.session.cart) req.session.cart = { biscuit: 0, meal: 0 };
  if (!req.session.paymentStatus) req.session.paymentStatus = { status: "NOT_STARTED" };
  next();
});

// Serve HTML Pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/cart.html", (req, res) => res.sendFile(path.join(__dirname, "public", "cart.html")));
app.get("/payment-status.html", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-status.html")));

// **🛒 Cart APIs**
app.get("/cart", (req, res) => res.json(req.session.cart));

app.post("/cart", (req, res) => {
  const { item, change } = req.body;
  if (req.session.cart[item] !== undefined) {
    req.session.cart[item] = Math.max(0, req.session.cart[item] + change);
  }
  res.json(req.session.cart);
});

// **🛍 Create Razorpay Order**
app.post("/create-order", async (req, res) => {
  try {
    const { amount, cart } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid order amount" });

    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: `order_${Date.now()}`,
    });

    // Store order details in session
    req.session.paymentStatus = { orderId: order.id, status: "PENDING", amount, items: cart };

    res.json({ id: order.id, amount: order.amount, key_id: razorpay.key_id });
  } catch (error) {
    console.error("❌ Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// **💳 Verify Razorpay Payment**
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    // Generate expected signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac("sha256", razorpay.key_secret).update(body).digest("hex");

    if (expectedSignature !== razorpay_signature) {
      req.session.paymentStatus = { orderId: razorpay_order_id, status: "FAILED" };
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    // Update session with successful payment
    req.session.paymentStatus = {
      orderId: razorpay_order_id,
      status: "SUCCESS",
      paymentId: razorpay_payment_id,
      amount: req.session.paymentStatus?.amount || 0,
      items: req.session.paymentStatus?.items || {},
    };

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// **🔍 Get Payment Status**
app.get("/payment-status", (req, res) => {
  res.json(req.session.paymentStatus || { status: "NOT_FOUND" });
});

// **🚀 Start Server**
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
