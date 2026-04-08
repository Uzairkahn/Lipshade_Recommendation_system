# 💄 Lipshade – Lipstick Recommendation System

Lipshade is a web-based lipstick recommendation system that helps users discover suitable lipstick shades through search, filtering, and undertone-based rule-driven recommendations.

---

## ✨ Features

- 🔍 Search lipstick products by brand or shade name  
- 🎨 Filter products by color family, finish, and brand  
- 💡 Recommend lipstick shades based on undertone  
- ⭐ Multi-factor ranking system (undertone, color, finish)  
- 📦 View product details including ingredients  
- 📱 Responsive and user-friendly interface  

---

## 🧠 Recommendation Logic

Lipshade uses a rule-based recommendation system.

**Scoring logic:**
- +2 points → undertone match  
- +1 point → color family match  
- +1 point → finish match  

Products are sorted by highest score first.

---

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Database:** JSON  

---

## 📁 Project Structure

```text

lipshade/
├── backend/
│ ├── server.js
│ ├── package.json
│ └── package-lock.json
├── frontend/
│ ├── index.html
│ ├── style.css
│ ├── script.js
│ └── lipstick_img.png
├── database/
│ └── lipsticks.json
└── README.md

```

---

## 🚀 How to Run Locally

### 1. Clone the repository
```bash
git clone https://github.com/Uzairkahn/Lipshade_Recommendation_system.git
cd Lipshade_Recommendation_system
2. Install dependencies
cd backend
npm install
3. Run the backend server
node server.js

The backend will run on:

http://localhost:3000
4. Run the frontend

Open the frontend/index.html file in your browser.

```
---
## Recommended method:

Open the project in VS Code
Install the Live Server extension
Right-click frontend/index.html
Select Open with Live Server

---
## 🌐 API Endpoints
Get all products
GET /api/lipsticks
Search products
GET /api/search?q=mac
Filter products
GET /api/filter?color_family=red&finish=matte&brand=mac
Get recommendations
GET /api/recommend?undertone=warm&color_family=red&finish=matte
Get a single product
GET /api/product/:id

---
## 📌 Notes
This project is based on rule-based logic (no machine learning)
Developed for academic and demonstration purposes
Backend must be running for frontend to function properly

---
## 👨‍💻 Author

Uzair Khan
🔗 GitHub: https://github.com/Uzairkahn

---
## 📄 License

This project is for educational use only.
