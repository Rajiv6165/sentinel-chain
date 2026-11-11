const express = require('express');
const lodash = require('lodash'); // Unused import
const app = express();

app.get('/greeting', (req, res) => {
    res.send('Welcome, visitor!');
});
