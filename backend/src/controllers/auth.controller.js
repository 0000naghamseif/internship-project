const users = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  const { username, password, role } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    username,
    password: hashedPassword,
    role: role || "Viewer",
  };

  users.push(user);

  res.json({ message: "User registered" });
};

exports.login = async (req, res) => {
  
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return res.status(401).json({ message: "Wrong password" });
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    "secretkey",
    { expiresIn: "1h" }
  );

  res.json({
    message: "Login successful",
    token,
    role: user.role
  });
};