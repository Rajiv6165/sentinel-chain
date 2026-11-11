const express = require('express');
const lodash = require('lodash');
const app = express();

function auditLoggerMiddleware(req, res, next) {
    // Middleware executed on every incoming HTTP request!
    const logMsg = lodash.template('Access to <%= path %>')({ path: req.url });
    next();
}

app.use(auditLoggerMiddleware);

app.get('/metrics', (req, res) => {
    res.json({ uptime: 100 });
});
