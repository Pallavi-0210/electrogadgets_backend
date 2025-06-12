// server.js
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

// CORS configuration
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration with MongoDB store
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        secure: false, // must be false in dev (true only for HTTPS in production)
        httpOnly: true,
        sameSite: 'lax', // use 'none' only if you set secure: true and use HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }

}));

// Routes
app.use('/api/', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// Stripe Payment Route
app.post('/api/create-payment-intent', async (req, res) => {
    console.log('=== Payment Intent Request ===');
    console.log('Request body:', req.body);
    console.log('Headers:', req.headers);

    const { payment_method_id, amount, currency = 'inr', email } = req.body;

    // Validation with detailed logging
    if (!payment_method_id) {
        console.log('ERROR: Missing payment_method_id');
        return res.status(400).json({ error: 'Payment method ID is required' });
    }

    if (!amount || amount <= 0) {
        console.log('ERROR: Invalid amount:', amount);
        return res.status(400).json({ error: 'Valid amount is required' });
    }

    console.log('Stripe Secret Key exists:', !!process.env.STRIPE_SECRET_KEY);
    console.log('Processing payment with:', {
        payment_method_id,
        amount: Math.round(amount),
        currency: currency.toLowerCase(),
        email
    });

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency: currency.toLowerCase(),
            payment_method: payment_method_id,
            confirmation_method: 'manual',
            confirm: true,
            return_url: 'http://localhost:3000/payment-complete',
            receipt_email: email,
            metadata: {
                integration_check: 'accept_a_payment',
            },
        });

        console.log('Payment Intent created:', {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount
        });

        if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
            console.log('Payment requires action');
            res.json({
                requires_action: true,
                payment_intent_client_secret: paymentIntent.client_secret,
                status: paymentIntent.status
            });
        } else if (paymentIntent.status === 'succeeded') {
            console.log('Payment succeeded immediately');
            res.json({
                success: true,
                payment_intent_id: paymentIntent.id,
                status: paymentIntent.status
            });
        } else if (paymentIntent.status === 'requires_payment_method') {
            console.log('Payment requires new payment method');
            res.status(400).json({
                error: 'Payment failed. Please try with a different payment method.',
                status: paymentIntent.status
            });
        } else {
            console.log('Unexpected payment status:', paymentIntent.status);
            res.status(400).json({
                error: `Payment status: ${paymentIntent.status}. Please try again.`,
                status: paymentIntent.status
            });
        }
    } catch (error) {
        console.error('Stripe payment error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});