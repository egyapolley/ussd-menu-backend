// noinspection JSCheckFunctionSignatures,DuplicatedCode

const express = require("express");
const router = express.Router();
const User = require("../models/user");
const passport = require("passport");
const BasicStrategy = require("passport-http").BasicStrategy;
const validate = require("../utils/validators")
const uuid = require("uuid");

require("dotenv").config();


const moment = require("moment");
const {Op, Transaction} = require("sequelize");
const sequelize = require("../utils/sql_database");

const axios = require("axios");




const soapRequest = require("easy-soap-request");
const parser = require('fast-xml-parser');
const he = require('he');
const {Distributor, Retailor} = require("../models/sql_models");
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

router.post('/create_dist', passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.createDistributor(req.body)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {businessName, contactId, areaZone, channel} = req.body

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
            status: "0",
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
router.post('/create_retail', passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.createRetailor(req.body)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {firstName, lastName, distributorId, businessName, contactId, channel,pin:distpin} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    let acctId = `101${contactId.substring(3)}`
    const isExistingMessage = await checkExisting(contactId)
    if (isExistingMessage) return res.json({status: 1, reason: isExistingMessage})

    const txn = await sequelize.transaction()
    try {

        let pin = generatePIN()

        const dist = await Distributor.findOne({where: {contactId:distributorId}})
        if (!dist) return res.json({status: 1, reason: "Your phone contact is not assigned a distributor."})
        if (dist.pin !==distpin)return res.json({status: 1, reason: 'Incorrect PIN provided. Please check and try Again'})

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


router.post('/activate_dist', passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.activatePIN(req.body)
    if (error) {
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {oldPIN, newPIN, acctId: contactId, channel} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    const dist = await Distributor.findOne({where: {contactId}})
    if (!dist) return res.json({status: 1, reason: "DISTRIBUTOR number does not exist."})
    if (dist) {
        if (dist.pin !== oldPIN) return res.json({
            status: 1,
            reason: 'Incorrect PIN provided. Please check and try Again'
        })

        dist.pin = newPIN
        dist.status = 'ACTIVE'
        try {
            await dist.save()
            res.json({status: 0, reason: "success"})
        } catch (ex) {
            console.log(ex)
            res.json({
                status: 1,
                reason: "System Error. Please contact sysAdmin"
            })
        }
    }


})
router.post('/activate_retail', passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.activatePIN(req.body)
    if (error) {
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {oldPIN, newPIN, acctId: contactId, channel} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    const ret = await Retailor.findOne({where: {contactId}})
    if (!ret) return res.json({status: 1, reason: "Retailor number does not exist."})
    if (ret) {
        if (ret.pin !== oldPIN) return res.json({
            status: 1,
            reason: 'Incorrect PIN provided. Please check and try Again'
        })
        ret.pin = newPIN
        ret.status = 'ACTIVE'
        try {
            await ret.save()
            res.json({status: 0, reason: "success"})
        } catch (ex) {
            console.log(ex)
            res.json({
                status: 1,
                reason: "System Error. Please contact sysAdmin"
            })

        }
    }


})

router.get("/balance_dist", passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.getBalance(req.query)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {acctId: contactId, pin, channel} = req.query

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }


    try {
        const dist = await Distributor.findOne({where: {contactId}})
        if (!dist) return res.json({status: 1, reason: "DISTRIBUTOR number does not exist."})
        if (dist.pin !== pin) return res.json({status: 1, reason: "Incorrect PIN provided. Please check and try Again"})
        const balance = await getINBalance(dist.acctId)
        res.json({
            status: 0,
            reason: "success",
            balance: (parseFloat((parseFloat(balance) / 100).toFixed(2))).toLocaleString()
        })

    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "System Error. Please contact sysAdmin"
        })

    }


})
router.get("/balance_retail", passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.getBalance(req.query)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {acctId: contactId, pin, channel} = req.query

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    try {
        const retail = await Retailor.findOne({where: {contactId}})
        if (!retail) return res.json({status: 1, reason: "RETAILOR number does not exist."})
        if (retail.pin !== pin) return res.json({
            status: 1,
            reason: "Incorrect PIN provided. Please check and try Again"
        })
        const balance = await getINBalance(retail.acctId)
        res.json({
            status: 0,
            reason: "success",
            balance: (parseFloat((parseFloat(balance) / 100).toFixed(2))).toLocaleString()
        })

    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "System Error. Please contact sysAdmin"
        })

    }


})

router.post("/cash_top_sub", passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.cashTopSub(req.body)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {acctId: contactId, pin, channel, msisdn, amount, surfContact} = req.body
    const realAmount = amount
    amount *= 100;

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    try {
        const retail = await Retailor.findOne({where: {contactId}})
        if (!retail) return res.json({status: 1, reason: "RETAILOR number does not exist."})
        if (retail.pin !== pin) return res.json({
            status: 1,
            reason: 'Incorrect PIN provided. Please check and try Again'
        })


        const txn_id = uuid.v4();
        await debitCash(retail.acctId, amount, txn_id)
        await creditCash(msisdn, txn_id, amount)
        res.json({status: 0, reason: "success"})
        if (surfContact) {
            try {
                let smsContent = `GHC${realAmount} credited on your Surfline number ${msisdn}. Dial *718*77# to buy bundle. Thank you`
                let smsContent1 = `GHC${realAmount} successfully transferred to ${msisdn}. Thank you`
                await pushSMS(surfContact, smsContent)
                await pushSMS(contactId, smsContent1)
            } catch (ex) {
                console.log("SMS Error", ex)
            }

        }


    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "Insufficient cash Credit in your account"
        })

    }


})
router.post("/cash_top_retail", passport.authenticate('basic', {session: false}), async (req, res) => {
    const {error} = validate.cashTopRetail(req.body)
    if (error) {
        console.log(JSON.stringify(error))
        return res.json({
            status: 2,
            reason: error.message
        })
    }

    let {acctId, pin, channel, retailorId, amount} = req.body
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
        const retail = await Retailor.findOne({where: {contactId: retailorId}})
        if (!dist) return res.json({status: 1, reason: "RETAILOR number does not exist."})
        if (dist.pin !== pin) return res.json({
            status: 1,
            reason: 'Incorrect PIN provided. Please check and try Again'
        })


        const txn_id = uuid.v4();
        await debitCash(dist.acctId.toString(), amount, txn_id)
        await creditCash(retail.acctId.toString(), txn_id, amount)
        res.json({status: 0, reason: "success"})

        try {
            let smsContent = `${dist.businessName} has transferred GHC ${realAmount} to your cash wallet number ${retailorId}. Thank you`
            let smsContent1 = `You have successfully transferred GHC ${realAmount} to  ${retailorId}. Thank you`

            await pushSMS(retailorId, smsContent)
            await pushSMS(acctId,smsContent1)

        } catch (ex) {
            console.log("SMS Error", ex)
        }


    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "Insufficient cash Credit in your account"
        })

    }


})


router.post("/data_top_retail", passport.authenticate('basic', {session: false}), async (req, res) => {


    let {acctId: contactId, pin, channel, msisdn, bundleId,bundle_cost,bundle_value} = req.body


    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }

    const retail = await Retailor.findOne({where: {contactId}})
    if (!retail) return res.json({status: 1, reason: "RETAILOR number does not exist."})
    if (retail.pin !== pin) return res.json({
        status: 1,
        reason: 'Incorrect PIN provided. Please check and try Again'
    })


    const txn_id = uuid.v4();



    const url = "http://172.25.39.16:2222";
    const sampleHeaders = {
        'User-Agent': 'NodeApp',
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'http://SCLINSMSVM01P/wsdls/Surfline/VoucherRecharge_USSD/VoucherRecharge_USSD',
        'Authorization': `Basic ${process.env.OSD_AUTH}`
    };

    let xmlRequest = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:dat="http://SCLINSMSVM01P/wsdls/Surfline/DATARechargeUSSDMobileMoney.wsdl">
   <soapenv:Header/>
   <soapenv:Body>
      <dat:DATARechargeUSSDMoMoRequest>
         <CC_Calling_Party_Id>${retail.acctId}</CC_Calling_Party_Id>
         <CHANNEL>USSD-DISTRIBUTOR</CHANNEL>
         <TRANSACTION_ID>${txn_id}</TRANSACTION_ID>
         <Recipient_Number>${msisdn}</Recipient_Number>
         <BundleName>${bundleId}</BundleName>
         <SubscriptionType>One-Off</SubscriptionType>
      </dat:DATARechargeUSSDMoMoRequest>
   </soapenv:Body>
</soapenv:Envelope>`;
    try {
        const {response} = await soapRequest({url: url, headers: sampleHeaders, xml: xmlRequest, timeout: 5000}); // Optional timeout parameter(milliseconds)

        const {body} = response;

        let jsonObj = parser.parse(body, options);
        let result = jsonObj.Envelope.Body;
        if (result.DATARechargeUSSDMoMoResult && result.DATARechargeUSSDMoMoResult.ServiceRequestID) {
            res.json({
                status: 0,
                reason: "success",
            })

            try {
                let smsContent = `${bundle_value} has been successfully sold to ${msisdn}  at a cost of GHC ${bundle_cost}. Thank you`
                await pushSMS(contactId, smsContent)

            } catch (ex) {
                console.log("SMS Error", ex)
            }




        }


    } catch (err) {
        let errorBody = err.toString();
        console.log(errorBody)
        if (parser.validate(errorBody) === true) {
            let jsonObj = parser.parse(errorBody, options);
            if (jsonObj.Envelope.Body.Fault) {
                let soapFault = jsonObj.Envelope.Body.Fault;
                let faultString = soapFault.faultstring;
                console.log(faultString);
                let errorcode = soapFault.detail.DATARechargeUSSDMoMoFault.errorCode;
                console.log(errorcode)
                switch (errorcode) {
                    case 60:
                        faultString = `You have insufficient credit in your account ${contactId}.Thank you`;
                        break
                    default:
                        faultString = "System Error";

                }
                return res.json(
                    {
                        status: 1,
                        reason: faultString,
                    })

            }


        }


        res.json({status: 1, reason: "System Failure"})

    }


})

router.post("/reset_pin", passport.authenticate('basic', {session: false}), async (req, res) => {

    try {
        const {acctId: contactId, type} = req.body
        let dist
        switch (type) {
            case 'DISTRIBUTOR':
                dist = await Distributor.findOne({where: {contactId}})
                break
            case 'RETAILOR':
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
        } else {
            res.json({status: 1, reason: `${contactId} is not a valid Retailor/Distributor number`})

        }
    } catch (ex) {
        res.json({status: 1, reason: 'System Error'})

    }


})


router.post("/user", async (req, res) => {
    try {
        let {username, password, channel} = req.body;
        let user = new User({
            username,
            password,
            channel
        });
        user = await user.save();
        res.json(user);

    } catch (error) {
        res.json({error: error.toString()})
    }


});

router.get("/checkValid", passport.authenticate('basic', {session: false}), async (req, res) => {

    let {contactId} = req.query


    try {
        const dist = await Distributor.findOne({where: {contactId}})
        if (dist) return res.json({status: 0, accountState: dist.status, type: "DISTRIBUTOR", reason: "success"})
        const retail = await Retailor.findOne({where: {contactId}})
        if (retail) return res.json({status: 0, accountState: retail.status, type: "RETAILOR", reason: "success"})
        res.json({
            status: 1,
            reason: `Your phone Number ${contactId} is not allowed`
        })


    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: `Your phone Number ${contactId} is not allowed`
        })

    }


})
router.get("/checkValidRetail", passport.authenticate('basic', {session: false}), async (req, res) => {

    let {contactId, distributorId} = req.query

    try {
        const dist = await Distributor.findOne({where: {contactId: distributorId}})
        const retail = await Retailor.findOne({where: {contactId}})

        if (retail) {
            if (!await dist.hasRetailor(retail)) return res.json({
                status: 1,
                reason: `Retailor number${contactId} is not assigned to you`
            })
            switch (retail.status) {
                case 'ACTIVE':
                    return res.json({status: 0, reason: 'success', data:retail.businessName})
                case 'CREATED':
                    return res.json({status: 1, reason: `Retailor number ${contactId} has not been activated`})
            }
        } else {
            return res.json({status: 1, reason: `Retailor number ${contactId} is invalid.`})
        }


    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: 'System Error. Please try again later'
        })

    }


})
router.get("/checkExisting", passport.authenticate('basic', {session: false}), async (req, res) => {

    let {contactId} = req.query
    const result =await checkExisting(contactId)
    if (!result) res.json({status:0,reason:'success'})
    else res.json({status:1,reason:result.toString()})


})



async function checkExisting(contactId) {
    const dist = await Distributor.findOne({where: {contactId}})
    if (dist) return `${contactId} is already registered as DISTRIBUTOR. Please use a different number`;
    const retail = await Retailor.findOne({where: {contactId}})
    if (retail) return `${contactId} is already registered as RETAILOR. Please use a different number`;
    return null;

}

async function checkAcctStatus(contactId, type) {
    switch (type) {
        case 'DISTRIBUTOR':
            const dist = await Distributor.findOne({where: {contactId}})
            if (dist.status !== 'ACTIVE') return `${contactId} is not ACTIVE.Please change PIN to activate `;
            break
        case 'RETAILOR':
            const ret = await Distributor.findOne({where: {contactId}})
            if (ret.status !== 'ACTIVE') return `${contactId} is not ACTIVE.Please change PIN to activate `;
            break

    }
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

async function debitCash(msisdn, amount, txn_id) {

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
         <pi:BALANCE>${amount}</pi:BALANCE>
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
    console.log(JSON.stringify(soapResponseBody))

    if (!soapResponseBody.CCSCD1_CHGResponse && soapResponseBody.CCSCD1_CHGResponse.AUTH) {
        let soapFault = jsonObj.Envelope.Body.Fault;
        let faultString = soapFault.faultstring;
        throw new Error(faultString.toString())
    }


}


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


function generatePIN() {
    const STRING = "123456789";
    const length = STRING.length;
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += STRING.charAt(Math.floor(Math.random() * length))
    }

    return code;

}


module.exports = router;

