const axios = require('axios');

function seedRemoteFixtures() {
    return axios.post('https://ci-database.local/seed', { clean: true });
}
