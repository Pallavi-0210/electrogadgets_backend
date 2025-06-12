const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');

const app = express();

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ 1. CORS
app.use(cors({
    origin: 'https://electrogadgets-frontend.vercel.app',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// ✅ 2. Sessions (must come before routes & body parsing)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        secure: true,      // ✅ Required for HTTPS (Render)
        sameSite: 'none',  // ✅ Required for cross-origin with Vercel
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ✅ 3. Log origin to debug cookie flow
app.use((req, res, next) => {
    console.log('Request Origin:', req.headers.origin);
    next();
});

// ✅ 4. Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 5. API Routes
app.use('/api/', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// ✅ 6. Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
