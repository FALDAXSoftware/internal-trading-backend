const { raw } = require('objection');
var express = require('express');
var app = express();
var moment = require('moment');
var i18n = require("i18n");
const logger = require("./logger");

var { AppController } = require('./AppController');
const constants = require('../../config/constants');
var Helper = require("../../helpers/helpers");
var UserModel = require("../../models/UsersModel");
var WalletModel = require("../../models/Wallet");
var TradeHistoryModel = require("../../models/TradeHistory");
var CurrencyConversionModel = require("../../models/CurrencyConversion");
var CoinsModel = require("../../models/Coins");
var ActivityModel = require("../../models/Activity");
var TempCoinMArketCapModel = require("../../models/TempCoinMarketCap");
const request = require('request');
var BuyAdd = require("../../helpers/buy/add-buy-order");
var socketHelper = require("../../helpers/sockets/emit-trades");
var SellAdd = require("../../helpers/sell/add-sell-order");
var TradeController = require("../../controllers/v1/TradeController");
var Currency = require("../../helpers/currency");
var CurrencyConversionModel = require("../../models/CurrencyConversion");
var PairsModel = require("../../models/Pairs");
var BuyBookModel = require("../../models/BuyBook");
var SellBookModel = require("../../models/SellBook");
var CoinsModel = require("../../models/Coins");
var cancelOldOrder = require("../../helpers/pending/cancel-pending-data")
var intrumentData = require("../../helpers/tradding/get-instrument-data");
var depthChartHelper = require("../../helpers/chart/get-depth-chart-detail");
// var fetSocketInfo = require("../../helpers/tradding/get-socket-value");
var latestBidPrice = require("../../helpers/get-bid-ask-latest");
var QueueValue = require("./QueueController");
var ActivityHelper = require("../../helpers/activity/add");
const redis = require("redis");
const axios = require("axios");
const port_redis = 6379;

const redis_client = redis.createClient(port_redis);

class DashboardController extends AppController {

    constructor() {
        super();
    }

    async getPortfolioData(req, res) {
        // return new Promise(async (resolve, reject) => {
        try {
            var user_id = await Helper.getUserId(req.headers, res);
            await logger.info({
                "module": "Portfolio Data",
                "user_id": "user_" + user_id,
                "url": "Trade Function",
                "type": "Entry"
            }, "Entered the function")
            var total = 0;
            // var data = await fetSocketInfo.getSocketValueData("LTC-BTC");
            // console.log(data);
            var data = await latestBidPrice.getLatestVaue("LTC-BTC");
            // console.log("data", data)
            var diffrenceValue = 0;
            var user_data = await UserModel
                .query()
                .first()
                .select("fiat", "diffrence_fiat", "total_value")
                .where('id', user_id)
                .andWhere('deleted_at', null)
                .andWhere('is_active', true)
                .orderBy('id', 'DESC');

            var currency = user_data.fiat;
            var yesterday = moment().utc().subtract(1, 'days').format("YYYY-MM-DD HH:mm:ss");
            var today = moment().utc().format("YYYY-MM-DD HH:mm:ss");
            var portfolioData = [];
            var average_price;

            var coinBalance = await WalletModel
                .query()
                .select('coin_name', 'balance', 'coin', 'coin_code')
                .fullOuterJoin('coins', 'wallets.coin_id', 'coins.id')
                .where('user_id', user_id)
                .andWhere('coins.is_fiat', false)
                .andWhere('wallets.deleted_at', null);

            for (var i = 0; i < coinBalance.length; i++) {
                var total_price = 0;

                var percentChange = 0.0;
                var currentPrice = 0.0;
                var previousPrice = 0.0;
                // console.log("coinBalance[i].coin", coinBalance[i].coin)
                var currentPriceFiat = await TempCoinMArketCapModel
                    .query()
                    .select("price")
                    .where('deleted_at', null)
                    .andWhere('coin', coinBalance[i].coin)
                    .andWhere("created_at", "<=", today)
                    .andWhere("created_at", ">=", yesterday)
                    .orderBy('id', 'DESC');

                // console.log("currentPriceFiat", currentPriceFiat)

                if (currentPriceFiat.length == 0) {
                    currentPrice = 0;
                } else {
                    currentPrice = currentPriceFiat[0].price;
                }

                average_price = currentPrice

                if (currentPriceFiat.length == 0) {
                    previousPrice = 0;
                } else {
                    previousPrice = currentPriceFiat[currentPriceFiat.length - 1].price;
                }


                var diffrence = currentPrice - previousPrice;
                percentChange = (diffrence / currentPrice) * 100;

                if (percentChange) {
                    percentChange = percentChange;
                } else {
                    percentChange = 0;
                }
                // var percentchange = 0.0
                var priceFiat = currentPriceFiat
                if (priceFiat == undefined) {
                    priceFiat = 0;
                    // percentchange = 0;
                } else {
                    // percentchange = priceFiat.quote.USD.percent_change_24h;
                    priceFiat = priceFiat.price;
                }

                total = total + percentChange;
                diffrenceValue = diffrenceValue + diffrence;
                var portfolio_data = {
                    "name": coinBalance[i].name,
                    "average_price": average_price,
                    "percentchange": percentChange,
                    "Amount": coinBalance[i].balance,
                    'symbol': coinBalance[i].coin_code,
                    "fiatPrice": priceFiat,
                    "name": coinBalance[i].coin_name
                }
                portfolioData.push(portfolio_data);
            }
            var changeValue = user_data.diffrence_fiat - diffrenceValue;
            changeValue = changeValue.toFixed(8)
            var totalFiat = user_data.total_value - total;
            totalFiat = totalFiat.toFixed(8)
            var userData = await UserModel
                .query()
                .first()
                .select()
                .where('id', user_id)
                .andWhere('deleted_at', null)
                .andWhere('is_active', true)
                .patch({
                    "diffrence_fiat": changeValue,
                    "total_value": totalFiat
                })
                .orderBy('id', 'DESC');
            // resolve(portfolioData)
            var response = {
                'portfolioData': portfolioData,
                'diffrence': changeValue,
                'total': totalFiat,
                "fiat": user_data.fiat
            };
            await logger.info({
                "module": "Portfolio Data",
                "user_id": "user_" + user_id,
                "url": "Trade Function",
                "type": "Success"
            }, i18n.__("portfolio data").message + "  " + response)
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("portfolio data").message,
                    "data": response
                });

        } catch (error) {
            console.log(JSON.stringify(error));
            await logger.info({
                "module": "Portfolio Data",
                "user_id": "user_" + user_id,
                "url": "Trade Function",
                "type": "Success"
            }, error)
        }
        // })
    }

    async getActivityData(req, res) {
        // return new Promise(async (resolve, reject) => {
        try {
            var user_id = await Helper.getUserId(req.headers, res);
            await logger.info({
                "module": "Activity Data",
                "user_id": "user_" + user_id,
                "url": "Trade Function",
                "type": "Entry"
            }, "Entered the function")

            var data = await ActivityModel
                .query()
                .select("quantity", "side", "created_at", "symbol", "fix_quantity")
                .where("user_id", user_id)
                .andWhere('is_market', false)
                .andWhere("is_cancel", false)
                .andWhere('deleted_at', null)
                .orderBy('id', 'DESC');

            // data.map((value1, i) => {
            //     value1.percentageChange = 100 - (((value1.quantity) / value1.fix_quantity) * 100);
            //     delete value1.fix_quantity;
            // });

            await logger.info({
                "module": "Activity Data",
                "user_id": "user_" + user_id,
                "url": "Trade Function",
                "type": "Success"
            }, i18n.__("activity data").message + " " + data)
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("activity data").message,
                    "data": data
                });
        } catch (error) {
            console.log(JSON.stringify(error));
            await logger.info({
                "module": "Activity Data",
                "user_id": "user_" + user_id,
                "url": "Trade Function",
                "type": "Error"
            }, error)
            return Helper.jsonFormat(res, constants.SERVER_ERROR_CODE, i18n.__("server error").message, []);
        }
        // })
    }

    async updateBuyOrderBook(pair_name) {
        try {
            let pair = pair_name.split("-").join("")

            await request({
                url: `https://api.binance.com/api/v3/depth?symbol=${pair}&limit=20`,
                method: "GET",
                headers: {
                    'Content-Type': 'application/json'
                },
                json: true
            }, async function (err, httpResponse, body) {
                var bidValue = body.bids;
                var askValue = body.asks;

                let { crypto, currency } = await Currency.get_currencies(pair_name);
                var maxValue = await PairsModel
                    .query()
                    .first()
                    .select()
                    .where("deleted_at", null)
                    .andWhere("name", pair_name)
                    .orderBy("id", 'DESC')

                if (maxValue.bot_status) {

                    var getCryptoValue = await CurrencyConversionModel
                        .query()
                        .first()
                        .select()
                        .where("deleted_at", null)
                        .andWhere("symbol", "LIKE", '%' + crypto + '%')
                        .orderBy("id", "DESC");

                    var usdValue = getCryptoValue.quote.USD.price
                    var min = (maxValue.crypto_minimum) / (usdValue);
                    var max = (maxValue.crypto_maximum) / (usdValue);
                    for (var i = 0; i < bidValue.length; i++) {
                        if (bidValue[i][1] > max) {
                            var highlightedNumber = Math.random() * (max - min) + min;
                            bidValue[i][1] = highlightedNumber
                        } else {
                            bidValue[i][1] = bidValue[i][1]
                        }
                    }
                    var now = new Date();
                    let requestedWallets = await CoinsModel
                        .query()
                        .select()
                        .where('deleted_at', null)
                        .andWhere('is_active', true)
                        .andWhere(function () {
                            this.where("coin", currency).orWhere("coin", crypto)
                        })
                    // .andWhere('user_id', inputs.requested_user_id);
                    var crypto_coin_id = null
                    var currency_coin_id = null
                    for (let index = 0; index < requestedWallets.length; index++) {
                        const element = requestedWallets[index];
                        if (element.coin == crypto) {
                            crypto_coin_id = element
                        } else if (element.coin == currency) {
                            currency_coin_id = element
                        }
                    }

                    for (var i = 0; i < bidValue.length; i++) {
                        // setTimeout(async () => {
                        var quantityValue = parseFloat(bidValue[i][1]).toFixed(8);
                        var priceValue = parseFloat(bidValue[i][0]).toFixed(8);

                        var buyLimitOrderData = {
                            'user_id': process.env.TRADEDESK_USER_ID,
                            'symbol': pair_name,
                            'side': 'Buy',
                            'order_type': 'Limit',
                            'created_at': now,
                            'updated_at': now,
                            'fill_price': 0.0,
                            'limit_price': priceValue,
                            'stop_price': 0.0,
                            'price': priceValue,
                            'quantity': quantityValue,
                            'fix_quantity': quantityValue,
                            'order_status': "open",
                            'currency': currency,
                            'settle_currency': crypto,
                            'maximum_time': now,
                            'is_partially_fulfilled': false,
                            'placed_by': process.env.TRADEDESK_BOT
                        };
                        // console.log("buyLimitOrderData", buyLimitOrderData)
                        buyLimitOrderData.is_partially_fulfilled = true;
                        buyLimitOrderData.is_filled = false;
                        buyLimitOrderData.added = true;
                        var flag = true;
                        // console.log("flag", flag)
                        // let responseData = await TradeController.limitBuyOrder(buyLimitOrderData.symbol,
                        //     buyLimitOrderData.user_id,
                        //     buyLimitOrderData.side,
                        //     buyLimitOrderData.order_type,
                        //     buyLimitOrderData.quantity,
                        //     buyLimitOrderData.limit_price,
                        //     null,
                        //     flag,
                        //     crypto_coin_id.id,
                        //     currency_coin_id.id);
                        // await module.exports.sleep(1000);
                        var queueName = process.env.QUEUE_NAME
                        // console.log("queueName", queueName)
                        var queueData = {
                            "symbol": pair_name,
                            user_id: process.env.TRADEDESK_USER_ID,
                            'side': 'Buy',
                            'order_type': 'Limit',
                            'orderQuantity': quantityValue,
                            "limit_price": buyLimitOrderData.limit_price,
                            res: null,
                            flag: true,
                            crypto: crypto_coin_id.id,
                            currency: currency_coin_id.id
                        }
                        QueueValue.publishToQueue(queueName, queueData)

                        // }, i * 800)
                        // let emit_socket = await socketHelper.emitTrades(crypto, currency, [process.env.TRADEDESK_USER_ID])
                    }
                }

                // return res.status(200).json({ "status": "OK" })


            })
        } catch (error) {

        }
    }

    async updateSellOrderBook(pair_name) {
        try {
            let pair = pair_name.split("-").join("")
            await request({
                url: `https://api.binance.com/api/v3/depth?symbol=${pair}&limit=20`,
                method: "GET",
                headers: {
                    'Content-Type': 'application/json'
                },
                json: true
            }, async function (err, httpResponse, body) {

                var askValue = body.asks;
                // console.log("askValue", askValue.length);
                let { crypto, currency } = await Currency.get_currencies(pair_name);
                var maxValue = await PairsModel
                    .query()
                    .first()
                    .select()
                    .where("deleted_at", null)
                    .andWhere("name", pair_name)
                    .orderBy("id", 'DESC')
                if (maxValue.bot_status) {

                    var getCryptoValue = await CurrencyConversionModel
                        .query()
                        .first()
                        .select()
                        .where("deleted_at", null)
                        .andWhere("symbol", "LIKE", '%' + crypto + '%')
                        .orderBy("id", "DESC");

                    var usdValue = getCryptoValue.quote.USD.price
                    var min = (maxValue.crypto_minimum) / (usdValue);
                    var max = (maxValue.crypto_maximum) / (usdValue);
                    // console.log("min", min);
                    // console.log("max", max);
                    // console.log("askValue.length", askValue.length)
                    // console.log("pair", pair)

                    for (var i = 0; i < askValue.length; i++) {
                        if (askValue[i][1] > max) {
                            var highlightedNumber = Math.random() * (max - min) + min;
                            askValue[i][1] = highlightedNumber
                        } else {
                            askValue[i][1] = askValue[i][1]
                        }
                    }

                    var now = new Date();
                    let requestedWallets = await CoinsModel
                        .query()
                        .select()
                        .where('deleted_at', null)
                        .andWhere('is_active', true)
                        .andWhere(function () {
                            this.where("coin", currency).orWhere("coin", crypto)
                        })
                    // .andWhere('user_id', inputs.requested_user_id);
                    var crypto_coin_id = null
                    var currency_coin_id = null
                    for (let index = 0; index < requestedWallets.length; index++) {
                        const element = requestedWallets[index];
                        if (element.coin == crypto) {
                            crypto_coin_id = element
                        } else if (element.coin == currency) {
                            currency_coin_id = element
                        }
                    }

                    for (var i = 0; i < askValue.length; i++) {
                        // console.log("askValue", askValue[i])
                        // setTimeout(async () => {
                        var quantityValue = parseFloat(askValue[i][1]).toFixed(8);
                        var priceValue = parseFloat(askValue[i][0]).toFixed(8);
                        let { crypto, currency } = await Currency.get_currencies(pair_name);
                        var sellLimitOrderData = {
                            'user_id': process.env.TRADEDESK_USER_ID,
                            'symbol': pair_name,
                            'side': 'Sell',
                            'order_type': 'Limit',
                            'created_at': now,
                            'updated_at': now,
                            'fill_price': 0.0,
                            'limit_price': priceValue,
                            'stop_price': 0.0,
                            'price': priceValue,
                            'quantity': quantityValue,
                            'fix_quantity': quantityValue,
                            'order_status': "open",
                            'currency': currency,
                            'settle_currency': crypto,
                            'maximum_time': now,
                            'is_partially_fulfilled': false,
                            'placed_by': process.env.TRADEDESK_BOT
                        };

                        sellLimitOrderData.is_partially_fulfilled = true;
                        sellLimitOrderData.is_filled = false;
                        sellLimitOrderData.added = true;
                        // console.log("sellLimitOrderData", sellLimitOrderData)

                        // let responseData = await TradeController.limitSellOrder(sellLimitOrderData.symbol,
                        //     sellLimitOrderData.user_id,
                        //     sellLimitOrderData.side,
                        //     sellLimitOrderData.order_type,
                        //     sellLimitOrderData.quantity,
                        //     sellLimitOrderData.limit_price,
                        //     null,
                        //     true,
                        //     crypto_coin_id.id,
                        //     currency_coin_id.id);

                        // await module.exports.sleep(1000);
                        var queueName = process.env.QUEUE_NAME
                        // console.log("queueName", queueName)
                        var queueData = {
                            "symbol": pair_name,
                            user_id: process.env.TRADEDESK_USER_ID,
                            "crypto": crypto,
                            currency: currency,
                            'side': 'Sell',
                            'order_type': 'Limit',
                            'orderQuantity': quantityValue,
                            "limit_price": sellLimitOrderData.limit_price,
                            res: null,
                            flag: true,
                            crypto: crypto_coin_id.id,
                            currency: currency_coin_id.id,
                        }
                        QueueValue.publishToQueue(queueName, queueData)

                        // }, i * 800)
                        // let emit_socket = await socketHelper.emitTrades(crypto, currency, [process.env.TRADEDESK_USER_ID])
                    }
                }

                // return res.status(200).json({ "status": "OK" })


            })
        } catch (error) {

        }
    }

    async updateBuyOrderBookValue(pair_name) {
        try {
            let pair = pair_name.split("-").join("")
            let SellBookHelper = require("../../helpers/sell/get-sell-book-order-summary");
            let BuyBookHelper = require("../../helpers/buy/get-buy-book-order-summary");
            let SellBookHelperAdd = require("../../helpers/sell/get-sell-order-by-price");
            let BuyBookHelperAdd = require("../../helpers/buy/get-buy-book-order-by-price");
            let BuyAdd = require("../../helpers/buy/add-buy-order");
            let SellAdd = require("../../helpers/sell/add-sell-order");
            var now = new Date();

            await request({
                url: `https://api.binance.com/api/v3/depth?symbol=${pair}&limit=20`,
                method: "GET",
                headers: {
                    'Content-Type': 'application/json'
                },
                json: true
            }, async function (err, httpResponse, body) {
                var bidValue = body.bids;
                var askValue = body.asks;
                // console.log("bidValue", bidValue)
                // console.log("askValue", askValue)
                let { crypto, currency } = await Currency.get_currencies(pair_name);
                var maxValue = await PairsModel
                    .query()
                    .first()
                    .select()
                    .where("deleted_at", null)
                    .andWhere("name", pair_name)
                    .orderBy("id", 'DESC');

                // console.log("maxValue", maxValue.bot_status)

                if (maxValue.bot_status == true) {

                    var getCryptoValue = await CurrencyConversionModel
                        .query()
                        .first()
                        .select()
                        .where("deleted_at", null)
                        .andWhere("symbol", "LIKE", '%' + crypto + '%')
                        .orderBy("id", "DESC");

                    var usdValue = getCryptoValue.quote.USD.price
                    var min = (maxValue.crypto_minimum) / (usdValue);
                    var max = (maxValue.crypto_maximum) / (usdValue);
                    var mergedArray = [];
                    for (var i = 0; i < bidValue.length; i++) {
                        bidValue[i][2] = "Buy"
                        if (bidValue[i][1] > max) {
                            var highlightedNumber = Math.random() * (max - min) + min;
                            bidValue[i][1] = highlightedNumber
                        } else {
                            bidValue[i][1] = bidValue[i][1]
                        }
                        mergedArray.push(bidValue[i])
                    }
                    for (var i = 0; i < askValue.length; i++) {
                        askValue[i][2] = "Sell"
                        if (askValue[i][1] > max) {
                            var highlightedNumber = Math.random() * (max - min) + min;
                            askValue[i][1] = highlightedNumber
                        } else {
                            askValue[i][1] = askValue[i][1]
                        }
                        mergedArray.push(askValue[i])
                    }

                    // console.log("mergedArray", mergedArray)

                    var mergedArray = await module.exports.shuffle(mergedArray)
                    // console.log("mergedArray", mergedArray)

                    let requestedWallets = await CoinsModel
                        .query()
                        .select()
                        .where('deleted_at', null)
                        .andWhere('is_active', true)
                        .andWhere(function () {
                            this.where("coin", currency).orWhere("coin", crypto)
                        })

                    var crypto_coin_id = null
                    var currency_coin_id = null
                    for (let index = 0; index < requestedWallets.length; index++) {
                        const element = requestedWallets[index];
                        if (element.coin == crypto) {
                            crypto_coin_id = element
                        } else if (element.coin == currency) {
                            currency_coin_id = element
                        }
                    }

                    for (var i = 0; i < mergedArray.length; i++) {
                        // console.log("mergedArray[i]", mergedArray[i])
                        // setTimeout(async () => {
                        var quantityValue = parseFloat(mergedArray[i][1]).toFixed(8);
                        var priceValue = parseFloat(mergedArray[i][0]).toFixed(8);
                        let bookData;
                        var flagValue = false;
                        if (mergedArray[i][2] == 'Buy') {
                            bookData = await SellBookHelper.sellOrderBookSummary(crypto, currency);
                            if (bookData.data.length > 0) {
                                // console.log("priceValue", priceValue);
                                // console.log("bookData.data[0].price", bookData.data[0].price);
                                // console.log("priceValue >= bookData.data[0].price", priceValue >= bookData.data[0].price)
                                if (priceValue >= bookData.data[0].price) {
                                    flagValue = true
                                } else {
                                    flagValue = false;
                                }
                            }
                        }
                        if (mergedArray[i][2] == 'Sell') {
                            bookData = await BuyBookHelper.getBuyBookOrderSummary(crypto, currency);
                            if (bookData.data.length > 0) {
                                // console.log("priceValue", priceValue);
                                // console.log("bookData.data[0].price", bookData.data[0].price);
                                // console.log("priceValue <= bookData.data[0].price", priceValue <= bookData.data[0].price)
                                if (priceValue <= bookData.data[0].price) {
                                    flagValue = true;
                                } else {
                                    flagValue = false;
                                }
                            }
                        }
                        // console.log("bookData", bookData)
                        // console.log("flagValue", flagValue)
                        // console.log("bookData.data.length", bookData.data.length)
                        // console.log("bookData.data.length > 0 && flagValue == true", bookData.data.length > 0 && flagValue == true)
                        // Check if book data found
                        if (bookData.data.length > 0 && flagValue == true) {
                            // console.log("UNDER Execution----------------------------------------------------------------------");
                            // Check if quantity is greater than maximum crypto set by admin
                            // var availableQuantity = bookData[0].quantity;
                            // console.log('availableQuantity < max', availableQuantity < max);
                            // if ( availableQuantity < max ) {
                            // quantityValue = parseFloat(max)-parseFloat(availableQuantity);
                            var buyLimitOrderData = {
                                'user_id': process.env.TRADEDESK_USER_ID,
                                'symbol': pair_name,
                                'side': mergedArray[i][2],
                                'order_type': 'Limit',
                                'created_at': now,
                                'updated_at': now,
                                'fill_price': 0.0,
                                'limit_price': priceValue,
                                'stop_price': 0.0,
                                'price': priceValue,
                                'quantity': quantityValue,
                                'fix_quantity': quantityValue,
                                'order_status': "open",
                                'currency': currency,
                                'settle_currency': crypto,
                                'maximum_time': now,
                                'is_partially_fulfilled': false,
                                'placed_by': process.env.TRADEDESK_BOT
                            };
                            // console.log("buyLimitOrderData", buyLimitOrderData)
                            buyLimitOrderData.is_partially_fulfilled = true;
                            buyLimitOrderData.is_filled = false;
                            buyLimitOrderData.added = true;
                            //     var flag = true;

                            var queueName = process.env.QUEUE_NAME + "-" + mergedArray[i][2]
                            // console.log("queueName for execution--------------", queueName)
                            var queueData = {
                                "symbol": pair_name,
                                user_id: process.env.TRADEDESK_USER_ID,
                                'side': mergedArray[i][2],
                                'order_type': 'Limit',
                                'orderQuantity': quantityValue,
                                "limit_price": buyLimitOrderData.limit_price,
                                res: null,
                                flag: true,
                                crypto: crypto_coin_id.id,
                                currency: currency_coin_id.id,
                            }
                            QueueValue.cronPublishToQueue(queueName, queueData)
                            // }
                        } else {
                            // console.log("Book is empty under addittion ......");
                            let bookData;
                            // if (mergedArray[i][2] == 'Buy') {
                            //     bookData = await BuyBookHelperAdd.BuyBookOrderData(crypto, currency, parseFloat(mergedArray[i][0]));
                            // }
                            // if (mergedArray[i][2] == 'Sell') {
                            //     bookData = await SellBookHelperAdd.SellBookOrderData(crypto, currency, parseFloat(mergedArray[i][0]));
                            // }

                            // console.log("bookData", bookData.length)

                            // var flag = false;
                            // if (bookData.length > 0) {
                            //     var availableQuantity = bookData[0].quantity;
                            //     // console.log('availableQuantity < max', availableQuantity < max);
                            //     // console.log("bookData", bookData);
                            //     if (availableQuantity < max) {
                            //         quantityValue = parseFloat(parseFloat(max) - parseFloat(availableQuantity)).toFixed(8);
                            //         flag = true;
                            //     }
                            // } else {
                            //     flag = true;
                            // }
                            // console.log("flag", flag)
                            // if (flag == true) {
                            var limitOrderData = {
                                'user_id': process.env.TRADEDESK_USER_ID,
                                'symbol': pair_name,
                                'side': mergedArray[i][2],
                                'order_type': 'Limit',
                                'created_at': now,
                                'updated_at': now,
                                'fill_price': 0.0,
                                'limit_price': priceValue,
                                'stop_price': 0.0,
                                'price': priceValue,
                                'quantity': quantityValue,
                                'fix_quantity': quantityValue,
                                'order_status': "open",
                                'currency': currency,
                                'settle_currency': crypto,
                                'maximum_time': now,
                                'is_partially_fulfilled': false,
                                'placed_by': process.env.TRADEDESK_BOT
                            };
                            limitOrderData.is_partially_fulfilled = true;
                            limitOrderData.is_filled = false;
                            limitOrderData.added = true;

                            limitOrderData.fix_quantity = limitOrderData.quantity;
                            limitOrderData.maker_fee = 0.0;
                            limitOrderData.taker_fee = 0.0;
                            delete limitOrderData.id;
                            delete limitOrderData.added;
                            delete limitOrderData.is_filled
                            // delete limitOrderData.side;
                            // delete sellAddedData.activity_id;

                            var activity = await ActivityHelper.addActivityData(limitOrderData);
                            limitOrderData.activity_id = activity.id
                            // console.log("Addittion mergedArray[i][2]", mergedArray[i][2])
                            if (mergedArray[i][2] == 'Buy') {
                                // console.log("INSIDE BUY ADD")
                                await BuyAdd.addBuyBookData(limitOrderData);
                            }
                            if (mergedArray[i][2] == 'Sell') {
                                // console.log("INSIDE SELL ADD")
                                await SellAdd.SellOrderAdd(limitOrderData);
                            }
                            // }
                        }
                        // }, i * 800)
                        // let emit_socket = await socketHelper.emitTrades(crypto, currency, [process.env.TRADEDESK_USER_ID])
                    }
                }
                // return res.status(200).json({ "status": "OK" })
            })
        } catch (error) {

        }
    }

    shuffle(arra1) {
        var ctr = arra1.length, temp, index;

        // While there are elements in the array
        while (ctr > 0) {
            // Pick a random index
            index = Math.floor(Math.random() * ctr);
            // Decrease ctr by 1
            ctr--;
            // And swap the last element with it
            temp = arra1[ctr];
            arra1[ctr] = arra1[index];
            arra1[index] = temp;
        }
        return arra1;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async deletePendingOrder(pair) {
        try {
            var maxValue = await PairsModel
                .query()
                .first()
                .select()
                .where("deleted_at", null)
                .andWhere("name", pair)
                .orderBy("id", 'DESC')

            // console.log("maxValue", maxValue)

            if (maxValue.bot_status == true) {
                var now = moment().utc().subtract(5, 'minutes').format("YYYY-MM-DD HH:mm:ss");
                var today = moment().utc().format("YYYY-MM-DD HH:mm:ss");
                // console.log("now", now)
                let { crypto, currency } = await Currency.get_currencies(pair);
                // console.log(`UPDATE activity_table SET is_cancel = true
                // WHERE id IN ( SELECT activity_id FROM buy_book
                //             WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //             AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'
                //         )`)
                // console.log(`UPDATE buy_book SET deleted_at = '${today}'
                // WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                // AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'`)
                // var balanceTotalQuery = await BuyBookModel.knex().raw(`SELECT SUM(limit_price * quantity) as total
                //                                                             FROM buy_book
                //                                                             WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //                                                             AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'`);
                // balanceTotalQuery = balanceTotalQuery.rows[0];
                var activityUpdate = await ActivityModel
                    .query()
                    .whereIn('id', function () {
                        this.select('activity_id')
                            .from('buy_book')
                            .where('deleted_at', null)
                            .andWhere('user_id', process.env.TRADEDESK_USER_ID)
                            .andWhere('symbol', 'LIKE', '%' + pair + '%')
                            .andWhere('placed_by', process.env.TRADEDESK_BOT)
                            .andWhere('created_at', '<=', now)
                    })
                    .patch({
                        'is_cancel': true
                    })

                // console.log("activityUpdate", activityUpdate)

                // var activityUpdate = await ActivityModel.knex().raw(`UPDATE activity_table SET is_cancel = true
                // WHERE id IN ( SELECT activity_id FROM buy_book
                //     WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //     AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'
                //     )`);

                var buyBookUpdate = await BuyBookModel
                    .query()
                    .where('deleted_at', null)
                    .andWhere('user_id', process.env.TRADEDESK_USER_ID)
                    .andWhere('symbol', 'LIKE', '%' + pair + '%')
                    .andWhere('placed_by', process.env.TRADEDESK_BOT)
                    .andWhere('created_at', '<=', now)
                    .patch({
                        deleted_at: today
                    })
                // var buyBookUpdate = await BuyBookModel.knex().raw(`UPDATE buy_book SET deleted_at = '${today}'
                //                                                         WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //                                                         AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'`);
                // var walletBalance = await WalletModel.knex().raw(`SELECT balance, placed_balance, coins.id
                //                                                         FROM wallets
                //                                                         LEFT JOIN coins
                //                                                         ON coins.id = wallets.coin_id
                //                                                         WHERE wallets.deleted_at IS NULL AND coins.deleted_at IS NULL
                //                                                         AND coins.coin= '${currency}' AND wallets.user_id = ${process.env.TRADEDESK_USER_ID}`)
                // walletBalance = walletBalance.rows[0];
                // var balance = (balanceTotalQuery.total == null) ? (0.0) : (balanceTotalQuery.total);
                // var updatedBalance = parseFloat(walletBalance.balance) + parseFloat(balance);
                // var updatedPlacedBalance = parseFloat(walletBalance.placed_balance) + parseFloat(balance);
                // var balanceUpdateQuery = await WalletModel.knex().raw(`UPDATE wallets SET balance = ${updatedBalance}, placed_balance = ${updatedPlacedBalance}
                //                                                             WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND coin_id = ${walletBalance.id};`)
            }
        } catch (error) {
            console.log(JSON.stringify(error));
        }
    }

    async deleteSellPendingOrder(pair) {
        try {
            var maxValue = await PairsModel
                .query()
                .first()
                .select()
                .where("deleted_at", null)
                .andWhere("name", pair)
                .orderBy("id", 'DESC')

            if (maxValue.bot_status == true) {
                var now = moment().utc().subtract(5, 'minutes').format("YYYY-MM-DD HH:mm:ss");
                var today = moment().utc().format("YYYY-MM-DD HH:mm:ss");
                let { crypto, currency } = await Currency.get_currencies(pair);
                // var balanceTotalQuery = await SellBookModel.knex().raw(`SELECT SUM(quantity) as total
                //                                                     FROM sell_book
                //                                                     WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //                                                     AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'`);
                // balanceTotalQuery = balanceTotalQuery.rows[0];

                var activityUpdate = await ActivityModel
                    .query()
                    .whereIn('id', function () {
                        this.select('activity_id')
                            .from('sell_book')
                            .where('deleted_at', null)
                            .andWhere('user_id', process.env.TRADEDESK_USER_ID)
                            .andWhere('symbol', 'LIKE', '%' + pair + '%')
                            .andWhere('placed_by', process.env.TRADEDESK_BOT)
                            .andWhere('created_at', '<=', now)
                    })
                    .patch({
                        'is_cancel': true
                    })

                // var activityUpdate = await ActivityModel.knex().raw(`UPDATE activity_table SET is_cancel = 'true'
                //                                                     WHERE id IN ( SELECT activity_id FROM sell_book
                //                                                         WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //                                                         AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'
                //                                                         )`);

                var buyBookUpdate = await SellBookModel
                    .query()
                    .where('deleted_at', null)
                    .andWhere('user_id', process.env.TRADEDESK_USER_ID)
                    .andWhere('symbol', 'LIKE', '%' + pair + '%')
                    .andWhere('placed_by', process.env.TRADEDESK_BOT)
                    .andWhere('created_at', '<=', now)
                    .patch({
                        deleted_at: today
                    })

                // var buyBookUpdate = await SellBookModel.knex().raw(`UPDATE sell_book SET deleted_at = '${today}'
                //                                                     WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND symbol LIKE '%${pair}%'
                //                                                     AND placed_by = '${process.env.TRADEDESK_BOT}' AND created_at <= '${now}'`);

                // var walletBalance = await WalletModel.knex().raw(`SELECT balance, placed_balance, coins.id
                //                                                 FROM wallets
                //                                                 LEFT JOIN coins
                //                                                 ON coins.id = wallets.coin_id
                //                                                 WHERE wallets.deleted_at IS NULL AND coins.deleted_at IS NULL
                //                                                 AND coins.coin= '${crypto}' AND wallets.user_id = ${process.env.TRADEDESK_USER_ID}`)

                // walletBalance = walletBalance.rows[0];
                // var balance = (balanceTotalQuery.total == null) ? (0.0) : (balanceTotalQuery.total);
                // var updatedBalance = parseFloat(walletBalance.balance) + parseFloat(balance);
                // var updatedPlacedBalance = parseFloat(walletBalance.placed_balance) + parseFloat(balance);

                // var balanceUpdateQuery = await WalletModel.knex().raw(`UPDATE wallets SET balance = ${updatedBalance}, placed_balance = ${updatedPlacedBalance}
                //                                                     WHERE deleted_at IS NULL AND user_id = ${process.env.TRADEDESK_USER_ID} AND coin_id = ${walletBalance.id};`)
            }
        } catch (error) {
            console.log(JSON.stringify(error));
        }
    }

    async getInstrumentDataValue(req, res) {
        try {

            const starShipInfo = await axios.get(
                `http://localhost:3012/api/v1/tradding/cached-instrument-details`
            );

            var starShipInfoValue = starShipInfo.data;

            redis_client.setex("instrument", 10, JSON.stringify(starShipInfoValue));
            return res.status(200)
                .json(starShipInfo.data)

        } catch (error) {
            console.log(JSON.stringify(error));
            // await logger.info({
            //     "module": "Portfolio Data",
            //     "user_id": "user_" + user_id,
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, error)
        }
    }

    async getCachedInstrumentDataValue(req, res) {
        try {

            var instrumentDataValue = await intrumentData.getInstrumentData();

            await logger.info({
                "module": "Instrument Data",
                "user_id": "user_",
                "url": "Trade Function",
                "type": "Success"
            }, i18n.__("instrument data").message + "  " + instrumentDataValue)
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("instrument data").message,
                    "data": instrumentDataValue
                });
        } catch (error) {
            console.log(JSON.stringify(error));
            // await logger.info({
            //     "module": "Portfolio Data",
            //     "user_id": "user_" + user_id,
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, error)
        }
    }

    async getDepthChartDetails(req, res) {
        try {
            var {
                symbol,
                limit
            } = req.query;
            // let { crypto, currency } = await Currency.get_currencies(symbol);

            // console.log("symbol", symbol)

            const starShipInfo = await axios.get(
                `http://localhost:3012/api/v1/tradding/cached-depth-chart-details?symbol=${symbol}`
            );

            // console.log("starShipInfo", starShipInfo.data.data)

            var starShipInfoValue = starShipInfo.data;

            redis_client.setex(symbol, 10, JSON.stringify(starShipInfoValue));
            return res.status(200)
                .json(starShipInfo.data)

            // var depthChartValue = await depthChartHelper.getDepthChartDetails(crypto, currency, limit)
            // await logger.info({
            //     "module": "Depth Chart Data",
            //     "user_id": "user_",
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, i18n.__("depth data").message + "  " + depthChartValue)
            // return res
            //     .status(200)
            //     .json({
            //         "status": constants.SUCCESS_CODE,
            //         "message": i18n.__("depth data").message,
            //         "data": depthChartValue
            //     });
        } catch (error) {
            console.log(JSON.stringify(error));
            // await logger.info({
            //     "module": "Portfolio Data",
            //     "user_id": "user_" ,
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, error)
        }
    }

    async getCachedDepthChartDetails(req, res) {
        try {
            var {
                symbol,
                limit
            } = req.query;
            let { crypto, currency } = await Currency.get_currencies(symbol);

            var depthChartValue = await depthChartHelper.getDepthChartDetails(crypto, currency, limit)
            await logger.info({
                "module": "Depth Chart Data",
                "user_id": "user_",
                "url": "Trade Function",
                "type": "Success"
            }, i18n.__("depth data").message + "  " + depthChartValue)
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("depth data").message,
                    "data": depthChartValue
                });
        } catch (error) {
            console.log(JSON.stringify(error));
            // await logger.info({
            //     "module": "Portfolio Data",
            //     "user_id": "user_" + user_id,
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, error)
        }
    }

    async getInstrumentValue(req, res) {
        try {

            var instrumentDataValue = await intrumentData.getInstrumentData();

            await logger.info({
                "module": "Instrument Data",
                "user_id": "user_",
                "url": "Trade Function",
                "type": "Success"
            }, i18n.__("instrument data").message + "  " + instrumentDataValue)
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("instrument data").message,
                    "data": instrumentDataValue
                });
        } catch (error) {
            console.log(JSON.stringify(error));
            // await logger.info({
            //     "module": "Portfolio Data",
            //     "user_id": "user_" + user_id,
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, error)
        }
    }

    async getValueDepthChartDetails(req, res) {
        try {

            var instrumentDataValue = await intrumentData.getInstrumentData();

            await logger.info({
                "module": "Instrument Data",
                "user_id": "user_",
                "url": "Trade Function",
                "type": "Success"
            }, i18n.__("instrument data").message + "  " + instrumentDataValue)
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("instrument data").message,
                    "data": instrumentDataValue
                });
        } catch (error) {
            console.log(JSON.stringify(error));
            // await logger.info({
            //     "module": "Portfolio Data",
            //     "user_id": "user_" + user_id,
            //     "url": "Trade Function",
            //     "type": "Success"
            // }, error)
        }
    }
}

module.exports = new DashboardController();