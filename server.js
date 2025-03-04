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

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });
const sharp = require("sharp");
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'strict-dynamic' https://apis.google.com https://checkout.razorpay.com; " +
      "connect-src 'self' https://www.googleapis.com https://lh3.googleusercontent.com https://drive.google.com; " +
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://drive.google.com; " +
      "frame-src https://drive.google.com https://checkout.razorpay.com; " +
      "style-src 'self' 'unsafe-inline';"
  );
  next();
});

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
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // make sure this is set properly
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 30 * 60 * 1000, // Set session timeout to 30 minutes
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
app.get("/xadminx", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);
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
  console.log("🔍 Debug: Menu Data Sent:", req.session.menu);
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

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

// Get Payment Status
app.get("/payment-status", (req, res) =>
  res.json(req.session.paymentStatus || { status: "NOT_FOUND" })
);

// Start Server
const PORT = process.env.PORT || 6900;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
