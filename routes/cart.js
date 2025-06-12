const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const verifyToken = require('../middleware/authMiddleware');

// ✅ Apply JWT middleware to all routes
router.use(verifyToken);

// Load cart data from database for logged-in users
const loadCartFromDB = async (req) => {
    try {
        const cart = await Cart.findOne({ userId: req.user.id });
        req.cart = cart?.items || [];
        req.savedItems = cart?.savedItems || [];
    } catch (err) {
        console.error('Error loading cart from DB:', err);
        throw err;
    }
};

// Sync cart and saved items with database
const syncCartToDB = async (req) => {
    try {
        const cartData = {
            userId: req.user.id,
            items: req.cart || [],
            savedItems: req.savedItems || [],
            updatedAt: new Date()
        };

        const cart = await Cart.findOneAndUpdate(
            { userId: req.user.id },
            cartData,
            { upsert: true, new: true, runValidators: true }
        );
        return cart;
    } catch (err) {
        console.error('Error saving cart to DB:', err);
        throw err;
    }
};

router.get('/', async (req, res) => {
    try {
        await loadCartFromDB(req);
        res.json({ success: true, cart: req.cart, count: req.cart.length });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.get('/saved', async (req, res) => {
    try {
        await loadCartFromDB(req);
        res.json({ success: true, savedItems: req.savedItems, count: req.savedItems.length });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { id, title, price, img, quantity } = req.body;
        if (!id || !title || typeof price !== 'number' || price < 0 || !img || typeof quantity !== 'number' || quantity < 1) {
            return res.status(400).json({ error: 'Invalid or missing fields' });
        }

        await loadCartFromDB(req);
        const existingIndex = req.cart.findIndex(item => item.id === id);
        if (existingIndex !== -1) {
            req.cart[existingIndex].quantity += quantity;
        } else {
            req.cart.push({ id, title, price, img, quantity });
        }

        await syncCartToDB(req);
        res.json({ success: true, message: 'Item added', cart: req.cart });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.post('/save', async (req, res) => {
    try {
        const { id, title, price, img } = req.body;
        if (!id || !title || typeof price !== 'number' || price < 0 || !img) {
            return res.status(400).json({ error: 'Invalid or missing fields' });
        }

        await loadCartFromDB(req);
        const exists = req.savedItems.find(item => item.id === id);
        if (!exists) req.savedItems.push({ id, title, price, img });

        await syncCartToDB(req);
        res.json({ success: true, message: 'Saved for later', savedItems: req.savedItems });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.delete('/save/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await loadCartFromDB(req);
        const initial = req.savedItems.length;
        req.savedItems = req.savedItems.filter(item => item.id !== id);
        if (initial === req.savedItems.length) return res.status(404).json({ error: 'Item not found' });
        await syncCartToDB(req);
        res.json({ success: true, message: 'Removed from saved items', savedItems: req.savedItems });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        if (!quantity || quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });

        await loadCartFromDB(req);
        const item = req.cart.find(item => item.id === id);
        if (!item) return res.status(404).json({ error: 'Item not found in cart' });
        item.quantity = quantity;

        await syncCartToDB(req);
        res.json({ success: true, message: 'Quantity updated', cart: req.cart });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await loadCartFromDB(req);
        const initial = req.cart.length;
        req.cart = req.cart.filter(item => item.id !== id);
        if (initial === req.cart.length) return res.status(404).json({ error: 'Item not found' });
        await syncCartToDB(req);
        res.json({ success: true, message: 'Item removed', cart: req.cart });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.delete('/', async (req, res) => {
    try {
        req.cart = [];
        await Cart.findOneAndUpdate(
            { userId: req.user.id },
            { items: [], updatedAt: new Date() },
            { upsert: true }
        );
        res.json({ success: true, message: 'Cart cleared', cart: [] });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

router.get('/count', async (req, res) => {
    try {
        await loadCartFromDB(req);
        const count = req.cart.reduce((sum, item) => sum + item.quantity, 0);
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

module.exports = router;
