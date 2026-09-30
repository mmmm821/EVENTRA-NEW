const { readDB, writeDB, uuid } = require("../utils/db");

function seatsLeft(ticketTypes) {
  return ticketTypes.reduce((sum, t) => sum + (t.totalSeats - t.bookedSeats), 0);
}

function totalSeats(ticketTypes) {
  return ticketTypes.reduce((sum, t) => sum + t.totalSeats, 0);
}

function withComputed(event, favoriteIds = []) {
  const minPrice = Math.min(...event.ticketTypes.map((t) => t.price));
  return {
    ...event,
    minPrice,
    seatsLeft: seatsLeft(event.ticketTypes),
    totalSeats: totalSeats(event.ticketTypes),
    isFavorite: favoriteIds.includes(event.id)
  };
}

// GET /api/events?search=&category=&sort=date|price&page=1&limit=8
exports.list = (req, res) => {
  const db = readDB();
  const { search = "", category = "all", sort = "date", page = 1, limit = 8 } = req.query;

  let events = db.events.filter((e) => e.status === "approved");

  if (search) {
    const q = search.toLowerCase();
    events = events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.organizerName.toLowerCase().includes(q)
    );
  }

  if (category && category !== "all") {
    events = events.filter((e) => e.category.toLowerCase() === category.toLowerCase());
  }

  events = events.sort((a, b) => {
    if (sort === "price") {
      return Math.min(...a.ticketTypes.map((t) => t.price)) - Math.min(...b.ticketTypes.map((t) => t.price));
    }
    return new Date(a.date) - new Date(b.date);
  });

  const favoriteIds = req.favoriteIds || [];
  const total = events.length;
  const start = (Number(page) - 1) * Number(limit);
  const paged = events.slice(start, start + Number(limit)).map((e) => withComputed(e, favoriteIds));

  res.json({ total, page: Number(page), limit: Number(limit), events: paged });
};

exports.categories = (req, res) => {
  const db = readDB();
  const cats = [...new Set(db.events.map((e) => e.category))];
  res.json({ categories: ["All", ...cats] });
};

exports.getById = (req, res) => {
  const db = readDB();
  const event = db.events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  const favoriteIds = req.favoriteIds || [];
  res.json({ event: withComputed(event, favoriteIds) });
};

// POST /api/events  (organizer)
exports.create = (req, res) => {
  const { title, category, venue, date, description, tags = [], image, ticketTypes = [] } = req.body;

  if (!title || !category || !venue || !date || !ticketTypes.length) {
    return res.status(400).json({ message: "Title, category, venue, date and at least one ticket type are required." });
  }

  const db = readDB();
  const event = {
    id: uuid(),
    title,
    category,
    organizerId: req.user.id,
    organizerName: req.user.name,
    venue,
    date,
    description: description || "",
    tags,
    image: image || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800",
    status: "pending", // requires admin approval, per platform governance
    isLive: false,
    ticketTypes: ticketTypes.map((t) => ({
      id: uuid(),
      name: t.name,
      price: Number(t.price),
      totalSeats: Number(t.totalSeats),
      bookedSeats: 0
    }))
  };

  db.events.push(event);
  writeDB(db);
  res.status(201).json({ event, message: "Event submitted for admin approval." });
};

// PUT /api/events/:id  (organizer, own events only)
exports.update = (req, res) => {
  const db = readDB();
  const event = db.events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (event.organizerId !== req.user.id) {
    return res.status(403).json({ message: "You can only edit your own events." });
  }

  const editable = ["title", "category", "venue", "date", "description", "tags", "image"];
  editable.forEach((field) => {
    if (req.body[field] !== undefined) event[field] = req.body[field];
  });

  writeDB(db);
  res.json({ event });
};

// PATCH /api/events/:id/cancel  (organizer, own events only)
exports.cancel = (req, res) => {
  const db = readDB();
  const event = db.events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (event.organizerId !== req.user.id) {
    return res.status(403).json({ message: "You can only cancel your own events." });
  }
  event.status = "cancelled";
  writeDB(db);
  res.json({ event, message: "Event cancelled." });
};

// PATCH /api/events/:id/favorite  (attendee)
exports.toggleFavorite = (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "User not found." });

  user.favorites = user.favorites || [];
  const idx = user.favorites.indexOf(req.params.id);
  if (idx >= 0) {
    user.favorites.splice(idx, 1);
  } else {
    user.favorites.push(req.params.id);
  }

  writeDB(db);
  res.json({ favorites: user.favorites });
};

exports.myFavorites = (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);
  const favIds = (user && user.favorites) || [];
  const events = db.events.filter((e) => favIds.includes(e.id)).map((e) => withComputed(e, favIds));
  res.json({ events });
};

// Middleware: attaches req.favoriteIds for the logged-in user (no-op if guest)
exports.attachFavorites = (req, res, next) => {
  req.favoriteIds = [];
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    try {
      const { verifyToken } = require("../utils/jwt");
      const payload = verifyToken(header.slice(7));
      const db = readDB();
      const user = db.users.find((u) => u.id === payload.id);
      req.favoriteIds = (user && user.favorites) || [];
    } catch (e) {
      /* guest or expired token — ignore, treat as guest */
    }
  }
  next();
};
