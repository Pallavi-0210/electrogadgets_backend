// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const verifyToken = require('./middleware/authMiddleware'); // ✅ Add this

const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');

const app = express();

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ CORS
app.use(cors({
    origin: 'https://electrogadgets-frontend.vercel.app',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ Debug origin
app.use((req, res, next) => {
    console.log('Request Origin:', req.headers.origin);
    next();
});

// ✅ Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ API routes
app.use('/api/', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// ✅ Stripe payment intent route (Add this block here ⬇️)
app.post('/api/create-payment-intent', verifyToken, async (req, res) => {
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
                userId: req.user?.id || 'guest'
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

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
