const express = require('express');
const lodash = require('lodash');
const app = express();

app.get('/public/ping', (req, res) => {
    res.send('pong');
});

app.post('/admin/render', (req, res) => {
    const tpl = lodash.template('Admin: <%= role %>');
    res.send(tpl({ role: 'superadmin' }));
});
