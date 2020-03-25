const { raw } = require('objection');
var express = require('express');
var app = express();
var moment = require('moment');
var i18n = require("i18n");

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

class DashboardController extends AppController {

    constructor() {
        super();
    }

    async getPortfolioData(req, res) {
        // return new Promise(async (resolve, reject) => {
        try {
            var user_id = await Helper.getUserId(req.headers);
            var total = 0;
            var diffrenceValue = 0;
            var user_data = await UserModel
                .query()
                .first()
                .select()
                .where('id', user_id)
                .andWhere('deleted_at', null)
                .andWhere('is_active', true)
                .orderBy('id', 'DESC');

            var currency = user_data.fiat;
            var yesterday = moment().subtract(1, 'days');
            var today = moment();
            var portfolioData = [];
            var average_price;

            var coinBalance = await WalletModel
                .query()
                .select('coin_name', 'balance', 'coin')
                .fullOuterJoin('coins', 'wallets.coin_id', 'coins.id')
                .where('user_id', user_id)
                .andWhere('coins.is_fiat', false);

            for (var i = 0; i < coinBalance.length; i++) {
                var total_price = 0;
                var price = await TradeHistoryModel
                    .query()
                    .select('fill_price')
                    .where('settle_currency', coinBalance[i].coin)
                    .andWhere('currency', currency)
                    .andWhere('created_at', '<=', today)
                    .andWhere('created_at', '>=', yesterday)
                    .orderBy('id', 'DESC')

                if (price.length == 0) {
                    average_price = 0;
                } else {
                    for (var j = 0; j < price.length; j++) {
                        total_price = total_price + price[j].fill_price;
                    }

                    average_price = total_price / (price.length);
                }

                var percentChange = 0.0;
                var currentPrice = 0.0;
                var previousPrice = 0.0;

                var currentPriceFiat = await TempCoinMArketCapModel
                    .query()
                    .first()
                    .select()
                    .where('deleted_at', null)
                    .andWhere('coin', coinBalance[i].coin)
                    .andWhere("created_at", "<=", today)
                    .andWhere("created_at", ">=", yesterday)
                    .orderBy('id', 'DESC');

                console.log(currentPriceFiat)

                if (currentPriceFiat == undefined) {
                    currentPrice = 0;
                } else {
                    currentPrice = currentPriceFiat.price;
                }

                var previousPriceFiat = await TempCoinMArketCapModel
                    .query()
                    .first()
                    .select()
                    .where('deleted_at', null)
                    .andWhere('coin', coinBalance[i].coin)
                    .andWhere("created_at", "<=", today)
                    .andWhere("created_at", ">=", yesterday)
                    .orderBy('id', 'ASC');

                if (previousPriceFiat == undefined) {
                    currentPrice = 0;
                } else {
                    previousPrice = previousPriceFiat.price;
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
                    'symbol': coinBalance[i].coin_name,
                    "fiatPrice": priceFiat
                }

                portfolioData.push(portfolio_data);

            }
            var changeValue = user_data.diffrence_fiat - diffrenceValue;
            var totalFiat = user_data.total_value - total;
            // resolve(portfolioData)
            var response = {
                'portfolioData': portfolioData,
                'diffrence': changeValue,
                'total': totalFiat,
                "fiat": user_data.fiat
            };
            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("portfolio data").message,
                    "data": response
                });

        } catch (error) {
            console.log(error);
        }
        // })
    }

    async getActivityData(req, res) {
        // return new Promise(async (resolve, reject) => {
        try {
            var user_id = await Helper.getUserId(req.headers);
            var data = await ActivityModel
                .query()
                .select()
                .where("user_id", user_id)
                .andWhere('is_market', false)
                .andWhere('deleted_at', null)
                .orderBy('id', 'DESC');

            data.map((value1, i) => {
                value1.percentageChange = 100 - (((value1.quantity) / value1.fix_quantity) * 100);
            });

            return res
                .status(200)
                .json({
                    "status": constants.SUCCESS_CODE,
                    "message": i18n.__("activity data").message,
                    "data": data
                });
        } catch (error) {
            console.log(error);
            return Helper.jsonFormat(res, constants.SERVER_ERROR_CODE, i18n.__("server error").message, []);
        }
        // })
    }
}

module.exports = new DashboardController();