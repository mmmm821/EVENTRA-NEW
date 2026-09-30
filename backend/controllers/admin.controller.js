const { readDB, writeDB } = require("../utils/db");

exports.stats = (req, res) => {
  const db = readDB();
  const totalUsers = db.users.filter((u) => u.role !== "admin").length;
  const totalEvents = db.events.length;
  const confirmedBookings = db.bookings.filter((b) => b.status === "confirmed");
  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + b.amount, 0);
  const totalCheckIns = db.tickets.filter((t) => t.checkedIn).length;

  res.json({ stats: { totalUsers, totalEvents, totalRevenue, totalCheckIns } });
};

exports.listEvents = (req, res) => {
  const db = readDB();
  const { status } = req.query;
  let events = db.events;
  if (status) events = events.filter((e) => e.status === status);
  res.json({ events: events.sort((a, b) => new Date(b.date) - new Date(a.date)) });
};

// PATCH /api/admin/events/:id/status   { status: "approved" | "rejected" }
exports.setEventStatus = (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "status must be approved, rejected or cancelled." });
  }
  const db = readDB();
  const event = db.events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });

  event.status = status;
  writeDB(db);
  res.json({ event });
};

exports.listUsers = (req, res) => {
  const db = readDB();
  const users = db.users
    .filter((u) => u.role !== "admin")
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      suspended: !!u.suspended,
      createdAt: u.createdAt
    }));
  res.json({ users });
};

// PATCH /api/admin/users/:id/suspend   { suspended: true|false }
exports.suspendUser = (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  user.suspended = !!req.body.suspended;
  writeDB(db);
  res.json({ message: `User ${user.suspended ? "suspended" : "reinstated"}.` });
};

exports.transactions = (req, res) => {
  const db = readDB();
  const transactions = db.bookings
    .filter((b) => b.status === "confirmed")
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
    .map((b) => {
      const event = db.events.find((e) => e.id === b.eventId);
      const user = db.users.find((u) => u.id === b.userId);
      return {
        id: b.id,
        eventTitle: event ? event.title : "Unknown event",
        userName: user ? user.name : "Unknown user",
        amount: b.amount,
        paymentId: b.paymentId,
        paidAt: b.paidAt
      };
    });
  res.json({ transactions });
};
