const lodash = require('lodash');

function formatUserCard(data) {
    return lodash.template('Card: <%= name %>')(data);
}
module.exports = { formatUserCard };
