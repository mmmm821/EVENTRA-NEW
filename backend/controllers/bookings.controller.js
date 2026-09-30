const { readDB, writeDB, uuid } = require("../utils/db");
const { signTicketToken, generateQRDataUrl } = require("../utils/qr");

// POST /api/bookings   { eventId, items: [{ ticketTypeId, quantity }] }
// Seats are held (bookedSeats incremented) the moment a booking is created —
// a real deployment would do this inside a DB transaction to stay race-safe
// under concurrent requests; here the single-process JSON store gives the
// same effect since requests are handled one at a time.
exports.create = (req, res) => {
  const { eventId, items = [] } = req.body;
  if (!eventId || !items.length) {
    return res.status(400).json({ message: "eventId and at least one ticket item are required." });
  }

  const db = readDB();
  const event = db.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ message: "Event not found." });

  let amount = 0;
  const resolvedItems = [];

  for (const item of items) {
    const type = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
    if (!type) return res.status(400).json({ message: "Invalid ticket type." });

    const qty = Number(item.quantity) || 0;
    const left = type.totalSeats - type.bookedSeats;
    if (qty < 1 || qty > left) {
      return res.status(409).json({ message: `Only ${left} "${type.name}" seat(s) left.` });
    }

    type.bookedSeats += qty; // hold inventory now, prevents overselling
    amount += type.price * qty;
    resolvedItems.push({ ticketTypeId: type.id, name: type.name, price: type.price, quantity: qty });
  }

  const booking = {
    id: uuid(),
    eventId,
    userId: req.user.id,
    items: resolvedItems,
    amount,
    status: "pending_payment", // pending_payment -> confirmed | cancelled
    createdAt: new Date().toISOString()
  };

  db.bookings.push(booking);
  writeDB(db);
  res.status(201).json({ booking });
};

// POST /api/bookings/:id/pay   { razorpayPaymentId? }
// Simulates Razorpay test-mode payment verification, then issues one
// signed, QR-coded ticket per seat purchased.
exports.pay = async (req, res) => {
  const db = readDB();
  const booking = db.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found." });
  if (booking.userId !== req.user.id) return res.status(403).json({ message: "Not your booking." });
  if (booking.status !== "pending_payment") {
    return res.status(409).json({ message: `Booking is already ${booking.status}.` });
  }

  // Server-side "verification" — in production this checks the Razorpay
  // signature (razorpay_order_id | razorpay_payment_id | razorpay_signature)
  // against RAZORPAY_KEY_SECRET via crypto.createHmac.
  const paymentId = req.body.razorpayPaymentId || `pay_test_${uuid().slice(0, 12)}`;

  booking.status = "confirmed";
  booking.paymentId = paymentId;
  booking.paidAt = new Date().toISOString();

  const event = db.events.find((e) => e.id === booking.eventId);
  const issuedTickets = [];

  for (const item of booking.items) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketId = uuid();
      const token = signTicketToken(ticketId, booking.eventId);
      const qrDataUrl = await generateQRDataUrl(token);

      const ticket = {
        id: ticketId,
        bookingId: booking.id,
        eventId: booking.eventId,
        eventTitle: event ? event.title : "Event",
        userId: req.user.id,
        ticketTypeName: item.name,
        price: item.price,
        token,
        qrDataUrl,
        checkedIn: false,
        checkedInAt: null,
        createdAt: new Date().toISOString()
      };
      db.tickets.push(ticket);
      issuedTickets.push(ticket);
    }
  }

  writeDB(db);
  res.json({ booking, tickets: issuedTickets, message: "Payment verified. Digital tickets issued." });
};

// PATCH /api/bookings/:id/cancel — releases held seats if not yet paid
exports.cancel = (req, res) => {
  const db = readDB();
  const booking = db.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found." });
  if (booking.userId !== req.user.id) return res.status(403).json({ message: "Not your booking." });
  if (booking.status !== "pending_payment") {
    return res.status(409).json({ message: "Only unpaid bookings can be cancelled." });
  }

  const event = db.events.find((e) => e.id === booking.eventId);
  if (event) {
    booking.items.forEach((item) => {
      const type = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
      if (type) type.bookedSeats = Math.max(0, type.bookedSeats - item.quantity);
    });
  }

  booking.status = "cancelled";
  writeDB(db);
  res.json({ booking });
};

exports.mine = (req, res) => {
  const db = readDB();
  const bookings = db.bookings
    .filter((b) => b.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ bookings });
};

exports.getById = (req, res) => {
  const db = readDB();
  const booking = db.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found." });
  if (booking.userId !== req.user.id) return res.status(403).json({ message: "Not your booking." });
  res.json({ booking });
};
