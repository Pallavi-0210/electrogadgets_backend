// routes/cart.js
const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');

// Middleware to initialize session cart for guests
const initSessionCart = (req) => {
    if (!req.session.cart) req.session.cart = [];
    if (!req.session.savedItems) req.session.savedItems = [];
};

// Load cart data from database for logged-in users
const loadCartFromDB = async (req) => {
    if (req.session.user) {
        try {
            const cart = await Cart.findOne({ userId: req.session.user.id });
            if (cart) {
                req.session.cart = cart.items || [];
                req.session.savedItems = cart.savedItems || [];
                console.log('Cart loaded from DB:', {
                    items: req.session.cart.length,
                    savedItems: req.session.savedItems.length
                });
            } else {
                req.session.cart = req.session.cart || [];
                req.session.savedItems = req.session.savedItems || [];
            }
        } catch (err) {
            console.error('Error loading cart from DB:', err);
            throw err;
        }
    } else {
        initSessionCart(req);
    }
};

// Sync session cart and saved items with database for logged-in users
const syncCartToDB = async (req) => {
    if (req.session.user) {
        const userId = req.session.user.id;
        console.log('Syncing cart for user:', userId);
        try {
            const cartData = {
                userId,
                items: req.session.cart || [],
                savedItems: req.session.savedItems || [],
                updatedAt: new Date()
            };

            const cart = await Cart.findOneAndUpdate(
                { userId },
                cartData,
                {
                    upsert: true,
                    new: true,
                    runValidators: true
                }
            );

            console.log('Cart synced to DB successfully:', {
                items: cart.items.length,
                savedItems: cart.savedItems.length
            });
            return cart;
        } catch (err) {
            console.error('Error saving cart to DB:', err);
            throw err;
        }
    }
};

// GET /api/cart - Get all items in the cart
router.get('/', async (req, res) => {
    try {
        console.log('GET /api/cart called, user:', req.session.user?.id);
        await loadCartFromDB(req);
        res.json({
            success: true,
            cart: req.session.cart || [],
            count: (req.session.cart || []).length
        });
    } catch (err) {
        console.error('Error fetching cart:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// GET /api/cart/saved - Get saved for later items
router.get('/saved', async (req, res) => {
    try {
        console.log('GET /api/cart/saved called, user:', req.session.user?.id);
        await loadCartFromDB(req);
        res.json({
            success: true,
            savedItems: req.session.savedItems || [],
            count: (req.session.savedItems || []).length
        });
    } catch (err) {
        console.error('Error fetching saved items:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// POST /api/cart - Add item to the cart or update if already exists
router.post('/', async (req, res) => {
    try {
        console.log('POST /api/cart received:', req.body);
        console.log('Session user:', req.session.user?.id);

        // Load current cart state
        await loadCartFromDB(req);

        const { id, title, price, img, quantity } = req.body;

        // Validation
        if (!id || !title || typeof price !== 'number' || price < 0 || !img || typeof quantity !== 'number' || quantity < 1) {
            console.log('Invalid fields:', { id, title, price, img, quantity });
            return res.status(400).json({
                error: 'Invalid or missing fields',
                required: { id: 'string', title: 'string', price: 'number >= 0', img: 'string', quantity: 'number >= 1' }
            });
        }

        // Find existing item or add new one
        const existingItemIndex = req.session.cart.findIndex(item => item.id === id);

        if (existingItemIndex !== -1) {
            // Update existing item
            req.session.cart[existingItemIndex].quantity += quantity;
            console.log(`Updated existing item quantity: ${req.session.cart[existingItemIndex].quantity}`);
        } else {
            // Add new item
            req.session.cart.push({ id, title, price, img, quantity });
            console.log('Added new item to cart');
        }

        // Sync to database
        await syncCartToDB(req);

        console.log('Final cart state:', req.session.cart.map(item => ({ id: item.id, quantity: item.quantity })));

        res.json({
            success: true,
            message: 'Item added to cart successfully',
            cart: req.session.cart,
            totalItems: req.session.cart.reduce((sum, item) => sum + item.quantity, 0)
        });
    } catch (err) {
        console.error('Error adding to cart:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// POST /api/cart/save - Save item for later
router.post('/save', async (req, res) => {
    try {
        console.log('POST /api/cart/save received:', req.body);

        await loadCartFromDB(req);

        const { id, title, price, img } = req.body;

        if (!id || !title || typeof price !== 'number' || price < 0 || !img) {
            console.log('Invalid fields:', { id, title, price, img });
            return res.status(400).json({
                error: 'Invalid or missing fields',
                required: { id: 'string', title: 'string', price: 'number >= 0', img: 'string' }
            });
        }

        // Check if item already exists in saved items
        const existingSavedItem = req.session.savedItems.find(item => item.id === id);
        if (!existingSavedItem) {
            req.session.savedItems.push({ id, title, price, img });
            console.log('Item saved for later');
        } else {
            console.log('Item already in saved items');
        }

        await syncCartToDB(req);

        res.json({
            success: true,
            message: 'Item saved for later',
            savedItems: req.session.savedItems
        });
    } catch (err) {
        console.error('Error saving item:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// DELETE /api/cart/save/:id - Remove item from saved for later
router.delete('/save/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('DELETE /api/cart/save/:id called, id:', id);

        await loadCartFromDB(req);

        const initialLength = req.session.savedItems.length;
        req.session.savedItems = req.session.savedItems.filter(item => item.id !== id);

        if (req.session.savedItems.length === initialLength) {
            return res.status(404).json({ error: 'Item not found in saved items' });
        }

        await syncCartToDB(req);

        console.log('Item removed from saved items');
        res.json({
            success: true,
            message: 'Item removed from saved for later',
            savedItems: req.session.savedItems
        });
    } catch (err) {
        console.error('Error removing saved item:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// PUT /api/cart/:id - Update item quantity
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;

        console.log('PUT /api/cart/:id called, id:', id, 'quantity:', quantity);

        if (!quantity || quantity < 1) {
            return res.status(400).json({ error: 'Quantity must be at least 1' });
        }

        await loadCartFromDB(req);

        const item = req.session.cart.find(item => item.id === id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found in cart' });
        }

        const oldQuantity = item.quantity;
        item.quantity = quantity;

        await syncCartToDB(req);

        console.log(`Updated item quantity from ${oldQuantity} to ${quantity}`);
        res.json({
            success: true,
            message: 'Item quantity updated',
            cart: req.session.cart,
            totalItems: req.session.cart.reduce((sum, item) => sum + item.quantity, 0)
        });
    } catch (err) {
        console.error('Error updating cart:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// DELETE /api/cart/:id - Remove item from cart
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('DELETE /api/cart/:id called, id:', id);

        await loadCartFromDB(req);

        const initialLength = req.session.cart.length;
        req.session.cart = req.session.cart.filter(item => item.id !== id);

        if (req.session.cart.length === initialLength) {
            return res.status(404).json({ error: 'Item not found in cart' });
        }

        await syncCartToDB(req);

        console.log('Item removed from cart');
        res.json({
            success: true,
            message: 'Item removed from cart',
            cart: req.session.cart,
            totalItems: req.session.cart.reduce((sum, item) => sum + item.quantity, 0)
        });
    } catch (err) {
        console.error('Error removing from cart:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// DELETE /api/cart - Clear the entire cart
router.delete('/', async (req, res) => {
    try {
        console.log('DELETE /api/cart called - clearing entire cart');

        req.session.cart = [];

        if (req.session.user) {
            await Cart.findOneAndUpdate(
                { userId: req.session.user.id },
                {
                    items: [],
                    updatedAt: new Date()
                },
                { upsert: true }
            );
            console.log('Cart cleared in database');
        }

        res.json({
            success: true,
            message: 'Cart cleared successfully',
            cart: [],
            totalItems: 0
        });
    } catch (err) {
        console.error('Error clearing cart:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// GET /api/cart/count - Get total item count in cart
router.get('/count', async (req, res) => {
    try {
        await loadCartFromDB(req);
        const totalItems = (req.session.cart || []).reduce((sum, item) => sum + item.quantity, 0);
        res.json({
            success: true,
            count: totalItems
        });
    } catch (err) {
        console.error('Error getting cart count:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

module.exports = router;