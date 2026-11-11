const express = require('express');
const { formatUserCard } = require('./renderer');
const router = express.Router();

router.post('/card', (req, res) => {
    const card = formatUserCard({ name: 'Alice' });
    res.json({ card });
});
