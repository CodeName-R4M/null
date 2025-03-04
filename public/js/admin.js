document.addEventListener("DOMContentLoaded", loadItems);

// Function to upload file to Google Drive
let isUploading = false;

function uploadFileToDrive(file) {
  if (isUploading) return;
  isUploading = true;

  const formData = new FormData();
  formData.append("image", file);

  fetch("/admin/upload-drive", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
      isUploading = false;
      if (data.success) {
        console.log("✅ Image uploaded successfully:", data.imageUrl);
        document.getElementById("uploaded-image-url").value = data.imageUrl;
        alert("Image uploaded successfully! Now add item details.");
      } else {
        console.error("❌ Image upload failed:", data.error);
        alert("Error uploading image: " + data.error);
      }
    })
    .catch((error) => {
      isUploading = false;
      console.error("Error uploading file:", error);
      alert("Error uploading file.");
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
  const name = document.getElementById("item-name").value.trim();
  const price = document.getElementById("item-price").value.trim();
  const imageUrlField = document.getElementById("uploaded-image-url");

  if (!name || !price || !imageUrlField) {
    alert("Please fill all fields and upload an image first!");
    return;
  }

  const imageUrl = imageUrlField.value;
  if (!imageUrl) {
    alert("Image upload failed. Please try again.");
    return;
  }

  const id = name.toLowerCase().replace(/\s+/g, "-"); // ✅ Unique ID

  fetch("/admin/add-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, price, image: imageUrl }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("Item added successfully!");
        loadItems(); // Reload menu
      } else {
        alert("Error adding item: " + data.message);
      }
    })
    .catch((error) => alert("Error adding item: " + error.message));
}


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
