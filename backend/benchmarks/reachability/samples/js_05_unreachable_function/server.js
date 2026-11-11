const express = require('express');
const lodash = require('lodash');
const app = express();

function deprecatedReportGenerator() {
    // Dead function - never invoked or exported
    return lodash.template('Report: <%= title %>');
}

app.get('/summary', (req, res) => {
    res.json({ status: 'ok' });
});
