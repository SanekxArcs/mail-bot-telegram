// utils/categoryStore.js

const fs = require("fs");
const path = require("path");

const categoryFilePath = path.join(__dirname, "categories.json");

function loadCategories() {
  if (fs.existsSync(categoryFilePath)) {
    const data = fs.readFileSync(categoryFilePath);
    return JSON.parse(data);
  }
  return ["newsletter", "task", "important", "other"]; // Початкові категорії
}

function saveCategories(categories) {
  fs.writeFileSync(categoryFilePath, JSON.stringify(categories, null, 2));
}

function addCategory(category) {
  const categories = loadCategories();
  if (!categories.includes(category)) {
    categories.push(category);
    saveCategories(categories);
  }
}

module.exports = {
  loadCategories,
  addCategory,
};
