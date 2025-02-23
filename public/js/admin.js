document.addEventListener("DOMContentLoaded", loadItems);

// 🚀 Load Items from Backend
function loadItems() {
  fetch("/admin/menu")
    .then((res) => res.json())
    .then((items) => {
      const container = document.getElementById("product-list");
      container.innerHTML = "";
      Object.keys(items).forEach((id) => {
        const item = items[id];
        const div = document.createElement("div");
        div.className = "product";
        div.innerHTML = `
          <img src="images/${item.image}" alt="${item.name}">
          <p>${item.name} - ₹${item.price}</p>
          <button class="remove-btn" onclick="removeItem('${id}')">Remove</button>
        `;
        container.appendChild(div);
      });
    })
    .catch((error) => console.error("Error loading items:", error));
}

// ✅ Add New Item with Image Upload
function addItem() {
  const name = document.getElementById("item-name").value.trim();
  const price = document.getElementById("item-price").value.trim();
  const imageFile = document.getElementById("item-image").files[0];

  if (!name || !price || !imageFile) {
    alert("Please fill all fields");
    return;
  }

  const id = name.toLowerCase().replace(/\s+/g, "-"); // ✅ Unique ID
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("name", id);
  formData.append("price", price);

  fetch("/admin/add-item", { 
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("Item added successfully!");
        loadItems();
      } else {
        alert("Error adding item: " + data.message);
      }
    })
    .catch((error) => console.error("Error adding item:", error));
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
    .catch((error) => console.error("Error removing item:", error));
}
