const express = require("express");
const Razorpay = require("razorpay");
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");
const fs = require("fs"); // ✅ Move `fs` here before using it
const tempDir = path.join(__dirname, "temp");
require("dotenv").config();
const fetch = require("node-fetch");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const cors = require("cors");
app.use(cors());
const multer = require("multer");
const Client = require("ftp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const serverless = require("serverless-http");
const mongoose = require("mongoose");

mongoose
  .connect(
    process.env.MONGODB_URI ||
      "mongodb+srv://sriram:CANTEENnpsb123@ram-cluster.9y8uc.mongodb.net/"
  )
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  paymentId: { type: String, required: true },
  amount: { type: Number, required: true },
  items: { type: Object, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: "PAID" }, // ✅ Default status is "PAID"
});

const Order = mongoose.model("Order", orderSchema);

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });
const sharp = require("sharp");

// Google Drive API setup
const { google } = require("googleapis");
// const fs = require("fs");

// Load Google Drive API credentials from .env
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

// Function to upload file to Google Drive
async function uploadToDrive(filePath, fileName) {
  try {
    console.log("📤 Uploading to Google Drive:", fileName);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        mimeType: "image/jpeg", // Ensure correct MIME type
      },
      media: {
        mimeType: "image/jpeg",
        body: fs.createReadStream(filePath),
      },
      fields: "id",
    });

    const fileId = response.data.id;
    console.log("✅ File uploaded successfully! File ID:", fileId);

    // 🌍 Make file publicly accessible
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    return fileId;
  } catch (error) {
    console.error("❌ Google Drive Upload Error:", error.message, error.stack);
    throw error;
  }
}

// Secure Sessions with Persistent Cart & Menu, Session Timeout after 30 mins
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false, // 🔴 Prevents setting session until login
    cookie: {
      secure: false, // ❌ If using HTTP, set to false (for HTTPS, use true)
      sameSite: "Lax",
      httpOnly: true,
      maxAge: 30 * 60 * 1000, // ⏳ Default session: 30 minutes
    },
  })
);
app.use("/images", express.static("public/images"));

// Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Middleware to Initialize Session Data
app.use((req, res, next) => {
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

// Serve Pages
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/cart.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "cart.html"))
);
app.get("/payment-status.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "payment-status.html"))
);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "admins"));
// Ensure staff.html is inside 'public'
function isAuthenticated(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") {
    return next();
  }
  res.redirect("/login.html");
}

app.get("/admin", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "admins", "admin.html"));
});

app.get("/staff", isAuthenticated, (req, res) => {
  const nonce = crypto.randomBytes(16).toString("base64");
  res.render(path.join(__dirname, "admins", "staff.ejs"), { nonce });
});
app.get("/js/admin.js", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "admins", "js", "admin.js"));
});

app.get("/js/staff.js", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "admins", "js", "staff.js"));
});

// ✅ Fixed login route (No Hashing, Uses .env)
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.user = { username, role: "admin" }; // ✅ Store user in session
    req.session.cookie.maxAge = 60 * 60 * 1000; // ✅ 1-hour session
    return res.json({ success: true });
  }

  res
    .status(401)
    .json({ success: false, error: "Invalid username or password" });
});

app.use((req, res, next) => {
  if (req.session.lastAccess) {
    const maxAge =
      req.session.userRole === "admin" ? 60 * 60 * 1000 : 30 * 60 * 1000;

    if (Date.now() - req.session.lastAccess > maxAge) {
      req.session.destroy();
    }
  }
  req.session.lastAccess = Date.now();
  next();
});

// ✅ Logout Route (Redirect to login page)
app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

const menuFilePath = path.join(__dirname, "menu.json");

function loadMenu() {
  if (!fs.existsSync(menuFilePath)) {
    console.log("⚠️ menu.json not found, creating a new one...");
    fs.writeFileSync(menuFilePath, JSON.stringify({}), "utf-8"); // ✅ Create empty menu.json
  }
  return JSON.parse(fs.readFileSync(menuFilePath, "utf-8"));
}
function saveMenu(menu) {
  fs.writeFileSync(menuFilePath, JSON.stringify(menu, null, 2), "utf-8");
}

let menu = loadMenu();
app.use((req, res, next) => {
  req.session.menu = menu;
  next();
});

// Cart APIs
app.get("/cart", (req, res) => res.json(req.session.cart));

app.post("/cart", (req, res) => {
  const { item, change } = req.body;
  if (!req.session.menu[item]) {
    return res.status(400).json({ error: "Item not found" });
  }
  req.session.cart[item] = Math.max(0, (req.session.cart[item] || 0) + change);
  res.json(req.session.cart);
});
app.post("/admin/upload-drive", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const imageName = `${Date.now()}_${req.file.originalname}`;
    const tempImagePath = path.join(tempDir, imageName);
    fs.writeFileSync(tempImagePath, req.file.buffer);
    console.log("📂 File saved at:", tempImagePath);

    const fileId = await uploadToDrive(tempImagePath, imageName);
    fs.unlinkSync(tempImagePath);

    res.json({
      success: true,
      imageUrl: `https://lh3.googleusercontent.com/d/${fileId}`,
    });
  } catch (error) {
    console.error(
      "❌ Error uploading file to Drive:",
      error.message,
      error.stack
    );
    res
      .status(500)
      .json({ error: "Failed to upload image", details: error.message });
  }
});

// Fix for 404 Error - Item Prices API
app.get("/item-prices", (req, res) => {
  const prices = {};
  Object.keys(req.session.menu).forEach((key) => {
    prices[key] = req.session.menu[key].price;
  });
  res.json(prices);
});

// Admin APIs
app.get("/admin/menu", (req, res) => {
  // console.log("🔍 Debug: Menu Data Sent:", req.session.menu);
  res.json(req.session.menu);
});
app.post("/admin/add-item", upload.single("image"), async (req, res) => {
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);

  const { id, name, price } = req.body;
  let imageUrl = req.body.image; // Get the image URL if available

  if (!id || !name || !price) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    // If an image file is uploaded, process it and upload to Google Drive
    if (req.file) {
      const imageName = `${name
        .replace(/\s+/g, "_")
        .toLowerCase()}_${Date.now()}.jpg`;

      // Convert image to JPG (if needed) and save it temporarily
      const tempImagePath = path.join(__dirname, "temp", imageName);
      await sharp(req.file.buffer).toFormat("jpeg").toFile(tempImagePath);

      // Upload to Google Drive
      const fileId = await uploadToDrive(tempImagePath, imageName);
      (imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`),
        // Clean up temporary file
        fs.unlinkSync(tempImagePath);
    }

    // Store the item in the menu
    menu[id] = { name, price, image: imageUrl };
    saveMenu(menu);

    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error("❌ Error adding item:", error);
    res.status(500).json({ error: "Failed to add item" });
  }
});

app.get("/proxy-image/:id", async (req, res) => {
  const fileId = req.params.id;
  const googleImageUrl = `https://lh3.googleusercontent.com/d/${fileId}=w500`;

  try {
    const response = await fetch(googleImageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    res.setHeader("Content-Type", response.headers.get("content-type"));
    response.body.pipe(res);
  } catch (error) {
    console.error("❌ Image Proxy Error:", error);
    res.status(500).send("Failed to load image");
  }
});
app.post("/admin/remove-item", async (req, res) => {
  const { id } = req.body;
  if (!menu[id]) return res.status(404).json({ error: "Item not found" });

  try {
    const imageUrl = menu[id].image;
    if (imageUrl && imageUrl.includes("lh3.googleusercontent.com/d/")) {
      const fileId = imageUrl.split("/d/")[1].split("?")[0]; // Extract file ID
      await drive.files.delete({ fileId });
      console.log("🗑️ Image deleted from Google Drive:", fileId);
    }

    delete menu[id];
    saveMenu(menu);
    delete req.session.cart[id];

    console.log("❌ Item Removed:", id);
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error removing item:", error);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

app.post("/admin/update-price", (req, res) => {
  const { id, price } = req.body;
  if (!menu[id]) return res.status(404).json({ error: "Item not found" });

  menu[id].price = price;
  saveMenu(menu);

  res.json({ success: true });
});

// Create Razorpay Order
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

// Checkout API
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

// Verify Razorpay Payment
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_amount,
      order_items,
      order_timestamp,
    } = req.body;

    console.log("📥 Received payment verification request:", req.body);

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !order_amount ||
      !order_items
    ) {
      console.error("❌ Missing payment details!", req.body);
      return res.status(400).json({ error: "Missing payment details" });
    }

    // ✅ Verify Razorpay Signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("❌ Invalid payment signature!");
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    // ✅ Ensure `order_items` is an object
    const parsedItems =
      typeof order_items === "string" ? JSON.parse(order_items) : order_items;

    // ✅ Store order in MongoDB
    const order = new Order({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount: order_amount,
      items: parsedItems,
      timestamp: order_timestamp ? new Date(order_timestamp) : Date.now(),
      status: "PAID", // ✅ Initially set to "PAID"
    });

    await order.save();
    console.log("✅ Payment saved in MongoDB!");

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// ✅ Update staff orders route to show only successful ones
app.get("/staff/orders", isAuthenticated, async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $in: ["PAID", "DELIVERED"] },
    }).sort({ timestamp: -1 });
    res.json(orders);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});
// Get Payment Status
app.get("/payment-status", (req, res) =>
  res.json(req.session.paymentStatus || { status: "NOT_FOUND" })
);
app.post("/update-order-status", async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ error: "Missing orderId or status" });
    }

    const order = await Order.findOneAndUpdate(
      { orderId },
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    console.log(`✅ Order ${orderId} status updated to ${status}`);
    res.json({ success: true, order });
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// Start Server
const PORT = process.env.PORT || 6900;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
module.exports.handler = serverless(app);
