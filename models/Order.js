const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    items: [
        {
            id: String,
            title: String,
            price: Number,
            img: String,
            quantity: Number,
        }
    ],
    subtotal: Number,
    tax: Number,
    total: Number,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Order', orderSchema);