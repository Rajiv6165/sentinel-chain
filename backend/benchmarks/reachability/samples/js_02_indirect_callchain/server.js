const express = require('express');
const lodash = require('lodash');
const router = express.Router();

function formatUserCard(data) {
    return lodash.template('Card: <%= name %>')(data);
}

router.post('/card', (req, res) => {
    const card = formatUserCard({ name: 'Alice' });
    res.json({ card });
});
