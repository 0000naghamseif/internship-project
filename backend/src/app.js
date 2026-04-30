const express = require("express");
const app = express();

app.use(express.json());

const authRoutes = require("./routes/auth.routes");
const verifyToken = require("./middleware/auth.middleware");
const allowRoles = require("./middleware/role.middleware");

app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Backend is working 🚀");
});

app.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "You are authorized",
    user: req.user
  });
});

app.get("/admin-only",
  verifyToken,
  allowRoles("Admin"),
  (req, res) => {
    res.json({ message: "Welcome Admin 👑" });
  }
);

app.listen(3001, () => {
  console.log("Server running on port 3001");
});