'use strict';

module.exports = function (webserver, controller) {
    webserver.get('/ping', (req, res) => {
        res.json({ _: 'pong' });
    });
};
