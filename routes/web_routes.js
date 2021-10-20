const express = require("express");
const router = express.Router();
const User = require("../models/user");
const passport = require("passport");
const BasicStrategy = require("passport-http").BasicStrategy;
const validate = require("../utils/validators2")

const uuid = require("uuid");
const utils = require("../utils/utils")


require("dotenv").config();
const moment = require("moment")


const soapRequest = require("easy-soap-request");
const parser = require('fast-xml-parser');
const he = require('he');
const {Distributor, Retailor,Transactions} = require("../models/sql_models");
const axios = require("axios");
const sequelize = require("../utils/sql_database");
const options = {
    attributeNamePrefix: "@_",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: true,
    ignoreNameSpace: true,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: false,
    trimValues: true,
    cdataTagName: "__cdata", //default is 'false'
    cdataPositionChar: "\\c",
    parseTrueNumberOnly: false,
    arrayMode: false,
    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),
    tagValueProcessor: (val, tagName) => he.decode(val),
    stopNodes: ["parse-me-as-string"]
};


const PI_ENDPOINT = process.env.PI_ENDPOINT;

passport.use(new BasicStrategy(
    function (username, password, done) {
        User.findOne({username: username}, function (err, user) {
            if (err) {
                return done(err);
            }
            if (!user) {
                return done(null, false);
            }
            user.comparePassword(password, function (error, isMatch) {
                if (err) return done(error);
                else if (isMatch) {
                    return done(null, user)
                } else {
                    return done(null, false);
                }

            })

        });
    }
));

router.get('/evdinfo', passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.checkContactId(req.query)
    if (error) {
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {contactId:evdId, user, channel} = req.query


    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    try {
        const retail = await Retailor.findOne({where: {contactId:evdId},include:[Distributor]})
        if (!retail) {
            const dist = await Distributor.findOne({where: {contactId:evdId}})
            if (!dist) return  res.json({status:1, reason:`${evdId} is not registered as EVD`})
            const {acctId, status,contactId,businessName} =dist
            let balance = await getINBalance(dist.acctId)
            //let balance = 13000

            balance= (parseFloat(balance)/100).toFixed(2).toLocaleString()
            res.json({
                status:0,
                reason:"success",
                data:{acctId, status, contactId,evdClass:"Distributor",businessName,balance}
            })

        }else {
            const {acctId, status, lastName, contactId, firstName,businessName} =retail
            let balance = await getINBalance(retail.acctId)
            //let balance = 13000
            balance= (parseFloat(balance)/100).toFixed(2).toLocaleString()
            res.json({
                status:0,
                reason:"success",
                data:{acctId, status, contactId,lastName, firstName,evdClass:"Retailor",businessName,balance,
                    distributorId:`${retail.distributor.contactId} - (${retail.distributor.businessName})`
                }
            })





        }


    } catch (ex) {
        console.log(ex)
        let errorMessage ="System Error"
        res.json({
            status: 1,
            reason: errorMessage
        })

    }


})

router.get('/evdalldist', passport.authenticate('basic', {session: false}), async (req, res) => {


    let {channel} = req.query

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    try {
        let dists = await Distributor.findAll({raw:true})
       dists = dists.map(item => {
           return {
               value: item.contactId,
               name: `${item.contactId} - (${item.businessName})`
           }

        })

        res.json({
            status:0,
            reason:"success",
            data:dists
        })

    } catch (ex) {
        console.log(ex)
        let errorMessage ="System Error"
        res.json({
            status: 1,
            reason: errorMessage,
        })

    }


})

router.get('/evdhist', passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.checkContactId(req.query)
    if (error) {
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {contactId:evdId, user, channel} = req.query

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    try {
        let txns = await Transactions.findAll({where: {contactId:evdId},order:[['createdAt','DESC']],limit:100,raw:true})
        if (txns.length === 0) {
            return res.json({
                    status: 1,
                    reason: `${evdId} has not history. Please make sure you provide the right contact.`
                })

        }
        txns = txns.map(value => {
            value.createdAt = moment(value.createdAt).format("DD-MM-YYYY HH:mm:ss")
            return value;

        })
        res.json({
            status:0,
            reason:"success",
            data:txns
        })

    } catch (ex) {
        console.log(ex)
        let errorMessage ="System Error"
        res.json({
            status: 1,
            reason: errorMessage
        })

    }


})

router.post('/evdadddist', passport.authenticate('basic', {session: false}), async (req, res) => {

    const {error} = validate.createDistributor(req.body)
    if (error) {
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {businessName, contactId, areaZone, channel,user} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }

    let acctId = `100${contactId.substring(3)}`

    const isExistingMessage = await checkExisting(contactId)
    if (isExistingMessage) return res.json({status: 1, reason: isExistingMessage})
    const txn = await sequelize.transaction()
    try {
        let pin = generatePIN()
        await Distributor.create({
            acctId,
            businessName,
            territoryCode: areaZone,
            contactId,
            pin,
        }, {transaction: txn})
        await createINAccount(acctId, "E-Distributors")
        await txn.commit();
        res.json({
            status: 0,
            reason: "success"
        })
        let smsContent = `Your PIN: ${pin}`
        try {
            await pushSMS(contactId, smsContent)
        } catch (ex) {
            console.log("SMS Error", ex)
        }


    } catch (ex) {
        console.log(ex)
        await txn.rollback()
        let errorMessage = "Distributor Creation Failed.System Failure.Please contact SysAdmin";
        if (ex.errors) {
            let {type, path, value} = ex.errors[0]
            if (type === 'unique violation') errorMessage = `${path}, ${value} already exist.`
        }

        res.json({
            status: 1,
            reason: errorMessage
        })

    }


})

router.post('/evdaddretail', passport.authenticate('basic', {session: false}), async (req, res) => {

    const {error} = validate.createRetailor(req.body)
    if (error) {
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {firstName, lastName, distributorId, businessName, contactId} = req.body



    let acctId = `101${contactId.substring(3)}`
    const isExistingMessage = await checkExisting(contactId)
    if (isExistingMessage) return res.json({status: 1, reason: isExistingMessage})

    const txn = await sequelize.transaction()
    try {

        let pin = generatePIN()

        const dist = await Distributor.findOne({where: {contactId:distributorId}})
        if (!dist) return res.json({status: 1, reason:`${distributorId} is not registered`})
        if (dist.status !== 'ACTIVE') return  res.json({status: 1, reason:`Distributor account ${distributorId} is not ACTIVE`})

        await dist.createRetailor({
            contactId,
            firstName,
            lastName,
            businessName,
            acctId,
            pin,
        }, {transaction: txn})
        await createINAccount(acctId, "E-Retailors")
        await txn.commit()
        res.json({
            status: 0,
            reason: "success"
        })

        let smsContent = `Your PIN: ${pin}`
        try {
            await pushSMS(contactId, smsContent)
        } catch (ex) {
            console.log("SMS Error", ex)
        }


    } catch (ex) {
        console.log(ex)
        await txn.rollback()
        let errorMessage = "Retailor Creation Failed.System Failure.Please contact SysAdmin";
        if (ex.errors) {
            let {type, path, value} = ex.errors[0]
            if (type === 'unique violation') errorMessage = `${path}, ${value} already exist.`
        }
        res.json({
            status: 1,
            reason: errorMessage
        })

    }





})

router.post("/evdcreditdist", passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.cashTopDist(req.body)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {acctId, channel, amount,user} = req.body
    const realAmount =amount
    amount *= 100;

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }

    try {
        const dist = await Distributor.findOne({where: {contactId: acctId}})
        if (dist){
            if (dist.status !=='ACTIVE') return res.json({status:1,reason:`Distributor number ${acctId} is not active`})
            const txn_id = uuid.v4();
            await creditCash(dist.acctId.toString(), txn_id, amount)
            res.json({status: 0, reason: "success"})

            try {

                let smsContent = `Hello ${dist.businessName}, your account number ${acctId} has been credited with GHC ${realAmount}. Thank you`
                await pushSMS(acctId,smsContent)


            } catch (ex) {
                console.log("SMS Error", ex)
            }

            try {
                const transactionObj = utils.getTransactionObj("dist-credit",acctId,{distributorId:acctId,amount:realAmount,user})
                await Transactions.create(transactionObj)
            }catch (ex){
                console.log("Log failure", ex)
            }

        }else {
            res.json({
                status: 2,
                reason: `Distributor number ${acctId} does not exist.`
            })

        }



    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "System Error."
        })

    }


})

router.post("/evdresetpin", passport.authenticate('basic', {session: false}), async (req, res) => {
    try {
        const {contactId, type,user} = req.body
        let dist
        switch (type) {
            case 'Distributor':
                dist = await Distributor.findOne({where: {contactId}})
                break
            case 'Retailor':
                dist = await Retailor.findOne({where: {contactId}})
                break
        }
        if (dist) {
            let pin = generatePIN()
            dist.pin = pin
            dist.status = 'CREATED'
            await dist.save()
            res.json({status: 0, reason: "success"})
            const smsContent = `Your PIN: ${pin}`
            try {
                await pushSMS(contactId, smsContent)
            } catch (ex) {
                console.log("SMS Error", ex)
            }

            try {
                const transactionObj = utils.getTransactionObj("pin-reset",contactId,{user})
                await Transactions.create(transactionObj)
            }catch (ex){
                console.log("Log failure", ex)
            }
        } else {
            res.json({status: 1, reason: `${contactId} is not a valid Retailor/Distributor number`})

        }
    } catch (ex) {
        res.json({status: 1, reason: 'System Error'})

    }





})
router.post("/evddisable", passport.authenticate('basic', {session: false}), async (req, res) => {
    try {
        const {contactId, type,user} = req.body
        let dist
        switch (type) {
            case 'Distributor':
                dist = await Distributor.findOne({where: {contactId}})
                break
            case 'Retailor':
                dist = await Retailor.findOne({where: {contactId}})
                break
        }

        if (dist) {
            if (dist.status !== 'ACTIVE') return   res.json({status: 1, reason: "Account not active"})
            dist.status = 'BLOCKED'
            await dist.save()
            res.json({status: 0, reason: "success"})
            try {
                const transactionObj = utils.getTransactionObj("acct-change",contactId,{user,status:"BLOCKED"})
                await Transactions.create(transactionObj)
            }catch (ex){
                console.log("Log failure", ex)
            }
        } else {
            res.json({status: 1, reason: `${contactId} is not a valid Retailor/Distributor number`})

        }
    } catch (ex) {
        res.json({status: 1, reason: 'System Error'})

    }





})

module.exports = router



async function getINBalance(msisdn) {
    const url = PI_ENDPOINT;


    const headers = {
        'User-Agent': 'NodeApp',
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'urn:CCSCD1_CHG',
    };


    const XML = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD1_QRY>
         <pi:username>${process.env.PI_USER}</pi:username>
         <pi:password>${process.env.PI_PASS}</pi:password>
         <pi:MSISDN>${msisdn}</pi:MSISDN>
         <pi:WALLET_TYPE>Primary</pi:WALLET_TYPE>
         <pi:LIST_TYPE>BALANCE</pi:LIST_TYPE>
         <pi:BALANCE_TYPE>General Cash</pi:BALANCE_TYPE>
      </pi:CCSCD1_QRY>
   </soapenv:Body>
</soapenv:Envelope>`;

    const {response} = await soapRequest({
        url: url,
        headers: headers,
        xml: XML,
        timeout: 5000
    });
    const {body} = response;
    let jsonObj = parser.parse(body, options);

    const soapResponseBody = jsonObj.Envelope.Body;


    if (soapResponseBody.CCSCD1_QRYResponse && (soapResponseBody.CCSCD1_QRYResponse.BALANCE !==null ||soapResponseBody.CCSCD1_QRYResponse.BALANCE !==undefined)) {
        return soapResponseBody.CCSCD1_QRYResponse.BALANCE
    } else {
        let soapFault = jsonObj.Envelope.Body.Fault;
        let faultString = soapFault.faultstring;
        throw new Error(faultString.toString())
    }


}
async function createINAccount(msisdn, productType) {
    const url = PI_ENDPOINT;

    const headers = {
        'User-Agent': 'NodeApp',
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'urn:CCSCD1_CHG',
    };

    const XML = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD1_ADD>
         <pi:username>${process.env.PI_USER}</pi:username>
         <pi:password>${process.env.PI_PASS}</pi:password>
         <pi:PROVIDER>Surfline</pi:PROVIDER>
         <pi:PRODUCT>${productType}</pi:PRODUCT>
         <pi:CURRENCY>GHS</pi:CURRENCY>
         <pi:INITIAL_STATE>A</pi:INITIAL_STATE>
         <pi:LANGUAGE>English</pi:LANGUAGE>
         <pi:MAX_CONCURRENT_ACCESS>10</pi:MAX_CONCURRENT_ACCESS>
         <pi:MSISDN>${msisdn}</pi:MSISDN>
      </pi:CCSCD1_ADD>
   </soapenv:Body>
</soapenv:Envelope>`

    const {response} = await soapRequest({
        url: url,
        headers: headers,
        xml: XML,
        timeout: 5000
    });
    const {body} = response;
    let jsonObj = parser.parse(body, options);

    const soapResponseBody = jsonObj.Envelope.Body;

    if (!(soapResponseBody.CCSCD1_ADDResponse && soapResponseBody.CCSCD1_ADDResponse.AUTH)) {
        let soapFault = jsonObj.Envelope.Body.Fault;
        let faultString = soapFault.faultstring;
        throw new Error(faultString.toString())
    }


}
async function checkExisting(contactId) {
    const dist = await Distributor.findOne({where: {contactId}})
    if (dist) return `${contactId} is already registered as DISTRIBUTOR. Please use a different number`;
    const retail = await Retailor.findOne({where: {contactId}})
    if (retail) return `${contactId} is already registered as RETAILOR. Please use a different number`;
    return null;

}
async function creditCash(msisdn, txn_id, amount) {
    const url = PI_ENDPOINT;

    const headers = {
        'User-Agent': 'NodeApp',
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'urn:CCSCD1_CHG',
    };


    const debitXML = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD1_CHG>
         <pi:username>admin</pi:username>
         <pi:password>admin</pi:password>
         <pi:MSISDN>${msisdn}</pi:MSISDN>
         <pi:BALANCE_TYPE>General Cash</pi:BALANCE_TYPE>
         <pi:BALANCE>-${amount}</pi:BALANCE>
         <pi:EXTRA_EDR>TRANSACTION_ID=${txn_id}|CHANNEL=USSD-DISTRIBUTOR</pi:EXTRA_EDR>
      </pi:CCSCD1_CHG>
   </soapenv:Body>
</soapenv:Envelope>`;

    const {response} = await soapRequest({
        url: url,
        headers: headers,
        xml: debitXML,
        timeout: 5000
    });
    const {body} = response;
    let jsonObj = parser.parse(body, options);

    const soapResponseBody = jsonObj.Envelope.Body;

    if (!soapResponseBody.CCSCD1_CHGResponse && soapResponseBody.CCSCD1_CHGResponse.AUTH) {
        let soapFault = jsonObj.Envelope.Body.Fault;
        let faultString = soapFault.faultstring;
        throw new Error(faultString.toString())
    }


}
function generatePIN() {
    const STRING = "123456789";
    const length = STRING.length;
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += STRING.charAt(Math.floor(Math.random() * length))
    }

    return code;

}
async function pushSMS(contact, smsContent) {
    const url = "http://api.hubtel.com/v1/messages/";
    const headers = {
        "Content-Type": "application/json",
        Authorization: `${process.env.SMS_AUTH}`
    };

    let messagebody = {
        Content: smsContent,
        FlashMessage: false,
        From: "Surfline",
        To: contact,
        Type: 0,
        RegisteredDelivery: true
    };
    await axios.post(url, messagebody, {headers})

}
