const { readDB } = require("../utils/db");

exports.dashboard = (req, res) => {
  const db = readDB();
  const myEvents = db.events.filter((e) => e.organizerId === req.user.id);
  const myEventIds = myEvents.map((e) => e.id);

  const myBookings = db.bookings.filter((b) => myEventIds.includes(b.eventId) && b.status === "confirmed");
  const myTickets = db.tickets.filter((t) => myEventIds.includes(t.eventId));

  const totalEvents = myEvents.length;
  const ticketsSold = myTickets.length;
  const revenue = myBookings.reduce((sum, b) => sum + b.amount, 0);
  const qrCheckIns = myTickets.filter((t) => t.checkedIn).length;

  const recentEvents = [...myEvents]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((e) => {
      const sold = myTickets.filter((t) => t.eventId === e.id).length;
      const capacity = e.ticketTypes.reduce((s, t) => s + t.totalSeats, 0);
      return { id: e.id, title: e.title, date: e.date, sold, capacity, status: e.status };
    });

  res.json({
    stats: { totalEvents, ticketsSold, revenue, qrCheckIns },
    recentEvents
  });
};

exports.myEvents = (req, res) => {
  const db = readDB();
  const events = db.events
    .filter((e) => e.organizerId === req.user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ events });
};
