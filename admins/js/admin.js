document.addEventListener("DOMContentLoaded", loadItems);

// Function to upload file to Google Drive
let isUploading = false;

function uploadFileToDrive() {
  if (!selectedFile) {
    alert("Please select an image file first.");
    return;
  }

  const uploadStatus = document.getElementById("upload-status");
  uploadStatus.textContent = "Uploading...";
  uploadStatus.className = "uploading";

  const formData = new FormData();
  formData.append("image", selectedFile);

  fetch("/admin/upload-drive", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        uploadStatus.textContent = "Upload Complete";
        uploadStatus.className = "upload-complete";
        document.getElementById("uploaded-image-url").value = data.imageUrl;
        isImageUploaded = true;
        document.getElementById("add-item-btn").disabled = false; // Enable the "Add Item" button
      } else {
        uploadStatus.textContent = "Upload Failed";
        uploadStatus.className = "upload-failed";
        isImageUploaded = false;
        document.getElementById("add-item-btn").disabled = true; // Keep the "Add Item" button disabled
      }
    })
    .catch((error) => {
      console.error("Error uploading image:", error);
      uploadStatus.textContent = "Upload Failed";
      uploadStatus.className = "upload-failed";
      isImageUploaded = false;
      document.getElementById("add-item-btn").disabled = true; // Keep the "Add Item" button disabled
    });
}

// Add event listener for file input change
document.getElementById("item-image").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadFileToDrive(file); // Upload the file
  }
});

// 🚀 Load Items from Backend
function loadItems() {
  fetch("/admin/menu")
    .then((res) => res.json())
    .then((items) => {
      console.log("📢 Items received:", items);
      const container = document.getElementById("product-list");
      container.innerHTML = "";

      Object.keys(items).forEach((id) => {
        const item = items[id];

        const div = document.createElement("div");
        div.className = "product";
        div.innerHTML = `
        <img src="${item.image}">
          <p>
            ${item.name} - ₹
            <span id="price-${id}">${item.price}</span>
            <button class="edit-btn" onclick="editPrice('${id}')">✏️</button>
          </p>
          <button class="remove-btn" onclick="removeItem('${id}')">Remove</button>
        `;

        container.appendChild(div);
      });
    })
    .catch((error) => console.error("Error loading items:", error));
}
function editPrice(id) {
  const priceSpan = document.getElementById(`price-${id}`);
  const currentPrice = priceSpan.innerText;

  const newPrice = prompt("Enter new price:", currentPrice);
  if (newPrice === null || isNaN(newPrice) || newPrice <= 0) return;

  // Send update request to backend
  fetch("/admin/update-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, price: newPrice }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        priceSpan.innerText = newPrice;
        alert("Price updated successfully!");
      } else {
        alert("Error updating price: " + data.error);
      }
    })
    .catch((error) => console.error("Error updating price:", error));
}

// ✅ Add New Item with Image Upload

function addItem() {
  if (!isImageUploaded) {
    alert("Please upload an image first.");
    return;
  }

  const name = document.getElementById("item-name").value.trim();
  const price = document.getElementById("item-price").value.trim();
  const imageUrl = document.getElementById("uploaded-image-url").value;

  if (!name || !price || !imageUrl) {
    alert("Please fill all fields and ensure the image is uploaded.");
    return;
  }

  const id = name.toLowerCase().replace(/\s+/g, "-"); // Unique ID

  fetch("/admin/add-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, price, image: imageUrl }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("Item added successfully!");
        loadItems();
        resetForm();
      } else {
        alert("Error adding item: " + data.message);
      }
    })
    .catch((error) => console.error("Error adding item:", error));
}

function resetForm() {
  document.getElementById("item-name").value = "";
  document.getElementById("item-price").value = "";
  document.getElementById("item-image").value = "";
  document.getElementById("uploaded-image-url").value = "";
  document.getElementById("upload-status").textContent = "";
  document.getElementById("upload-status").className = "";
  document.getElementById("add-item-btn").disabled = true;
  isImageUploaded = false;
  selectedFile = null;
}

document.getElementById("item-image").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadFileToDrive(file);
  }
});
// ❌ Remove Item
function removeItem(id) {
  fetch("/admin/remove-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("Item removed!");
        loadItems();
      } else {
        alert("Error removing item: " + data.message);
      }
    })

    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("Item removed!");
        loadItems();
      } else {
        alert("Error removing item: " + data.message);
      }
    })
    .catch((error) => alert("Error removing item: " + error.message));
}
let selectedFile = null;

function handleFileSelect(file) {
  selectedFile = file;
  document.getElementById("upload-status").textContent = "File selected";
  document.getElementById("upload-status").className = "";
}
