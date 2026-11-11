const express = require('express');
const lodash = require('lodash');
const app = express();

app.get('/render', (req, res) => {
    const compiled = lodash.template('Hello <%= user %>');
    res.send(compiled({ user: req.query.name || 'world' }));
});
