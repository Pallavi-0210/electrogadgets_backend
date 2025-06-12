const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// --- SIGNUP ROUTE ---
router.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create and save new user
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();

        // Initialize session for the new user
        req.session.user = { id: newUser._id, email: newUser.email, name: newUser.name };

        res.status(201).json({ message: 'User created successfully', user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- LOGIN ROUTE ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Store user data in session
        req.session.user = { id: user._id, email: user.email, name: user.name };

        res.status(200).json({ message: 'Login successful', user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- LOGOUT ROUTE ---
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).json({ error: 'Failed to log out' });
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.status(200).json({ message: 'Logout successful' });
    });
});

// --- USER ROUTE ---
router.get('/user', (req, res) => {
    if (req.session.user) {
        res.status(200).json({ message: `Welcome back, ${req.session.user.name}!`, user: req.session.user });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

module.exports = router;