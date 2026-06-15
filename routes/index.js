/**
 * 主路由聚合模組
 */
module.exports = function registerRoutes(router, handlers) {
    require('./systemRoutes')(router, handlers);
    require('./economyRoutes')(router, handlers);
    require('./toolRoutes')(router, handlers);
    require('./casinoRoutes')(router, handlers);
    require('./javdbRoutes')(router, handlers);
    require('./auctionRoutes')(router, handlers);
    require('./atonementRoutes')(router, handlers);
    require('./jailRoutes')(router, handlers);
    require('./rpgRoutes')(router, handlers);
    require('./policeRoutes')(router, handlers);
    require('./mafiaRoutes')(router, handlers);
    require('./worldcupRoutes')(router, handlers);
};
