const { readDB, writeDB } = require("../utils/db");
const { verifyTicketToken } = require("../utils/qr");

exports.mine = (req, res) => {
  const db = readDB();
  const tickets = db.tickets
    .filter((t) => t.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ tickets });
};

exports.getById = (req, res) => {
  const db = readDB();
  const ticket = db.tickets.find((t) => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ message: "Ticket not found." });
  if (ticket.userId !== req.user.id) return res.status(403).json({ message: "Not your ticket." });
  res.json({ ticket });
};

// POST /api/tickets/verify   { input }  — input is either the raw signed
// QR token, or a plain ticket ID typed in manually ("EVT-xxxxxxx").
// Organizer / admin only — used at the venue check-in desk.
exports.verify = (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ valid: false, message: "Provide a ticket ID or scanned QR value." });

  const db = readDB();
  let ticket = null;

  // Try as a signed QR token first (tamper-proof path).
  try {
    const payload = verifyTicketToken(input.trim());
    ticket = db.tickets.find((t) => t.id === payload.ticketId);
  } catch (e) {
    // Not a valid signed token — fall back to a direct ticket-ID lookup
    // (matches the manual "Enter Ticket ID" field in the UI).
    ticket = db.tickets.find((t) => t.id === input.trim() || t.id.startsWith(input.trim()));
  }

  if (!ticket) {
    return res.status(404).json({ valid: false, message: "Ticket not found or QR is invalid/tampered." });
  }
  if (ticket.checkedIn) {
    return res.status(409).json({
      valid: false,
      message: "This ticket has already been checked in.",
      checkedInAt: ticket.checkedInAt
    });
  }

  ticket.checkedIn = true;
  ticket.checkedInAt = new Date().toISOString();
  writeDB(db);

  const attendee = db.users.find((u) => u.id === ticket.userId);

  res.json({
    valid: true,
    message: "Valid ticket. Entry granted.",
    ticket: {
      id: ticket.id,
      eventTitle: ticket.eventTitle,
      ticketTypeName: ticket.ticketTypeName,
      checkedInAt: ticket.checkedInAt,
      attendeeName: attendee ? attendee.name : "Unknown"
    }
  });
};
