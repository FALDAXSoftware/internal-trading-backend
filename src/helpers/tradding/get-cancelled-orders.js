var moment = require('moment');
var ActivityModel = require("../../models/Activity");
var PendingOrdersExecutionModel = require("../../models/PendingOrdersExecutuions");
const {
    raw
} = require('objection');


var getCancelledOrders = async (user_id, crypto, currency, month, limit = 2000) => {

    var cancelDetails;

    var yesterday = moment.utc().subtract(month, 'months').format();

    cancelDetails = await ActivityModel
        .query()
        .select('id',
            'fix_quantity',
            'quantity',
            'fill_price',
            'side',
            'order_type',
            'symbol',
            'created_at',
            'deleted_at',
            'limit_price',
            "placed_by")
        .where('deleted_at', null)
        .andWhere('is_cancel', true)
        .andWhere('settle_currency', crypto)
        .andWhere('currency', currency)
        .andWhere('created_at', ">=", yesterday)
        .andWhere(builder => {
            builder.where('user_id', user_id)
                .orWhere('requested_user_id', user_id)
        })
        .orderBy('id', 'DESC')
        .limit(limit);
    // console.log("cancelDetails", cancelDetails)

    var pendingCancelDetails = await PendingOrdersExecutionModel
        .query()
        .select('id',
            'quantity',
            'side',
            'order_type',
            'symbol',
            'created_at',
            'deleted_at',
            'limit_price',
            "placed_by")
        .where('deleted_at', null)
        .andWhere('is_cancel', true)
        .andWhere('settle_currency', crypto)
        .andWhere('currency', currency)
        .andWhere('created_at', ">=", yesterday)
        .andWhere("user_id", user_id)
        .orderBy('id', 'DESC')
        .limit(limit);

    if (cancelDetails != undefined) {
        cancelDetails = cancelDetails.push(pendingCancelDetails);
    } else {
        cancelDetails = pendingCancelDetails
    }

    return (cancelDetails);

}

var getUserCancelledOrders = async (user_id, crypto, currency, limit = 2000, page, fromDate, toDate) => {

    var cancelDetails;
    cancelDetails = await ActivityModel
        .query()
        .select('id',
            'fix_quantity',
            'quantity',
            'fill_price',
            'side',
            'order_type',
            'symbol',
            'created_at',
            'deleted_at',
            'limit_price',
            "placed_by")
        .where('deleted_at', null)
        .andWhere('is_cancel', true)
        .andWhere('settle_currency', crypto)
        .andWhere('currency', currency)
        .andWhere(builder => {
            builder.where('user_id', user_id)
                .orWhere('requested_user_id', user_id)
        })
        .andWhere(builder => {
            if (fromDate != '' && toDate != '') {
                builder.where('created_at', '>=', fromDate)
                    .andWhere('created_at', '<=', toDate)
            }
        })
        .page(parseInt(page - 1), limit)
        .orderBy('id', 'DESC')
        .limit(limit);
    cancelDetails.nextPage = parseInt(page - 1) + 1;
    return (cancelDetails);

}

module.exports = {
    getCancelledOrders,
    getUserCancelledOrders
}