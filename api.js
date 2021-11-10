'use strict';

module.exports = {

    async getSomething({ homey, query })
    {
        return homey.app.getSomething(query);
    },
    async postSomething({ homey, query, body })
    {
        const result = homey.app.addSomething(body);
        return result;
    },
    async sendLog({ homey, body })
    {
        return homey.app.sendLog(body);
    },
};
