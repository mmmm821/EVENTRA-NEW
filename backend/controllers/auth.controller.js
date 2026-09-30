const bcrypt = require("bcryptjs");
const { readDB, writeDB, uuid } = require("../utils/db");
const { signToken } = require("../utils/jwt");

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

exports.register = (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  const allowedRoles = ["attendee", "organizer"]; // admins are seeded, not self-registered
  const finalRole = allowedRoles.includes(role) ? role : "attendee";

  const db = readDB();
  const exists = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }

  const user = {
    id: uuid(),
    name,
    email,
    password: bcrypt.hashSync(password, 10),
    role: finalRole,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDB(db);

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.status(201).json({ token, user: publicUser(user) });
};

exports.login = (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const db = readDB();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ token, user: publicUser(user) });
};

exports.me = (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ user: publicUser(user) });
};
