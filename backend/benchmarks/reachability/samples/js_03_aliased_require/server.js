const express = require('express');
const _ = require('lodash');
const app = express();

app.post('/compile', (req, res) => {
    const tpl = _.template('<%= msg %>');
    res.send(tpl({ msg: 'hi' }));
});
