// import * as socket from "ejs";

var express = require('express');
var router = express.Router();

// var app = express();
// route grouping
var TradeController = require('../controllers/v1/TradeController');
var TradingViewController = require('../controllers/v1/TradingViewController');
var UserFavouritesController = require("../controllers/v1/UserFavourites");
var DashboardController = require("../controllers/v1/DashboardController");
var TradeDesk = require("../controllers/v1/TradeDeskController");
var sqsController = require("../controllers/v1/SQSController");

router.get("/soc", function (req, res) {
  io.emit('user-connecting', { name: req.user.name });
  return res.json({ status: 1 })
});

// router.post('/orders/market-sell-create', TradeController.marketSell);
// router.post('/orders/market-buy-create', TradeController.marketBuy);
// router.post('/orders/limit-buy-order-create', TradeController.limitBuy);
// router.post('/orders/limit-sell-order-create', TradeController.limitSell);

// Queue Implementation
router.post('/orders/market-sell-create', TradeController.marketSellQueue);
router.post('/orders/market-buy-create', TradeController.marketBuyQueue);
router.post('/orders/limit-buy-order-create', TradeController.limitBuyOrderQueue);
router.post('/orders/limit-sell-order-create', TradeController.limitSellOrderQueue);


router.post('/orders/pending-buy-order-create', TradeController.stopLimitBuyOrder);
router.post('/orders/pending-sell-order-create', TradeController.stopLimitSellOrder);
router.post('/trade/add-favourite-pair', UserFavouritesController.addFavouritesData)
router.post('/cancel-pending-order', TradeController.cancelPendingOrder)
router.get('/get-chart-data-graph', UserFavouritesController.getFavouritesData);
router.get('/get-activity-data', DashboardController.getActivityData)
router.get('/get-portfolio-data', DashboardController.getPortfolioData);
router.get('/update-order-book', DashboardController.updateBuyOrderBook);
router.get('/update-sell-order-book', DashboardController.updateSellOrderBook);
router.get("/get-pairs-value", TradeDesk.getQuantityMinMaxValue);
router.post("/update-pairs-value", TradeDesk.updateQuantityMinMaxValue)
router.get("/get-spread-value", TradeDesk.getSpreadValue)
router.get("/get-tradedesk-user-balances", TradeDesk.getWalletTradeDeskBalance)
router.get("/get-instrument-data", DashboardController.getInstrumentDataValue)
router.get("/depth-chart-details", DashboardController.getDepthChartDetails)
// router.get('/order/candle-stick-chart', TradeController.getCandleStickData)
router.get("/get-user-trade-history", TradeController.getUserOrdersData)

// Trading View API
router.get('/tradingview/config', TradingViewController.getConfig);
router.get('/tradingview/time', TradingViewController.getCurrentTime);
router.get('/tradingview/symbols', TradingViewController.getSymbolInfo);
router.get('/tradingview/history', TradingViewController.getHistoryData);

// SQS routes
// router.post('/send-data',)
router.get("/list-queues", sqsController.getSQSData);
router.get("/send--to-queue", sqsController.sendToSQS);

module.exports = router;
