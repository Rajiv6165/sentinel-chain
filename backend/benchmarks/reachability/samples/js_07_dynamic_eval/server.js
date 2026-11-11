const express = require('express');
const app = express();

app.post('/dynamic-exec', (req, res) => {
    const dynamicCode = "require('lodash').template('Dynamic <%= val %>')({ val: 'ok' })";
    const result = eval(dynamicCode);
    res.send(result);
});
