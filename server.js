const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const Stripe = require('stripe');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Allowed frontend origins
const allowedOrigins = [
    'https://electrogadgets-frontend.vercel.app'
];

// ✅ 1. CORS config — must come BEFORE session
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// ✅ 2. Session config — before body parsers
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        secure: true,         // ✅ Required for HTTPS (Render uses HTTPS)
        httpOnly: true,
        sameSite: 'none',     // ✅ Required for cross-origin (Vercel → Render)
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// (Optional) Log request origin for debug
app.use((req, res, next) => {
    console.log('Request Origin:', req.headers.origin);
    next();
});

// ✅ 3. Body parsers — after session
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 4. API Routes
app.use('/api/', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// ✅ 5. Stripe payment route
app.post('/api/create-payment-intent', async (req, res) => {
    console.log('=== Payment Intent Request ===');
    const { payment_method_id, amount, currency = 'inr', email } = req.body;

    if (!payment_method_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid payment data' });
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency: currency.toLowerCase(),
            payment_method: payment_method_id,
            confirmation_method: 'manual',
            confirm: true,
            return_url: 'https://electrogadgets-frontend.vercel.app/payment-complete',
            receipt_email: email,
            metadata: {
                integration_check: 'accept_a_payment',
            },
        });

        if (paymentIntent.status === 'requires_action') {
            return res.json({
                requires_action: true,
                payment_intent_client_secret: paymentIntent.client_secret,
                status: paymentIntent.status
            });
        }

        if (paymentIntent.status === 'succeeded') {
            return res.json({
                success: true,
                payment_intent_id: paymentIntent.id,
                status: paymentIntent.status
            });
        }

        return res.status(400).json({
            error: `Payment failed with status: ${paymentIntent.status}`,
            status: paymentIntent.status
        });

    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ 6. Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
