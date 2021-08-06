// noinspection JSCheckFunctionSignatures,DuplicatedCode

const express = require("express");
const router = express.Router();
const User = require("../models/user");
const validator = require("../utils/validators");
const passport = require("passport");
const BasicStrategy = require("passport-http").BasicStrategy;
const validate = require("../utils/validators")


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

const sessions = {}

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

    let {businessName, contactId, areaZone, margin, channel, emailId} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    contactId = `233${contactId.substring(1)}`

    const isExistingMessage = await checkExisting(contactId)
    if (isExistingMessage) return res.json({status: 1, reason: isExistingMessage})
    try {
        let acctId = `DIST-${contactId}`
        let pin = generatePIN()
        await Distributor.create({
            distributorId: acctId,
            businessName,
            territoryCode: areaZone,
            margin,
            contactId,
            pin,
            emailId
        })
        res.json({
            status: "0",
            reason: "success"
        })
    } catch (ex) {
        let {type, path, value} = ex.errors[0]
        let errorMessage = "Distributor Creation Failed.System Failure.Please contact SysAdmin";
        if (type === 'unique violation') errorMessage = `${path}, ${value} already exist.`
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

    let {firstName, lastName, distributorId, businessName, contactId, margin, channel} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }

    contactId = `233${contactId.substring(1)}`
    distributorId = `233${distributorId.substring(1)}`

    const isExistingMessage = await checkExisting(contactId)
    if (isExistingMessage) return res.json({status: 1, reason: isExistingMessage})

    const dist = await Distributor.findOne({where: {contactId: distributorId}})
    if (!dist) return res.json({status: 1, reason: "DISTRIBUTOR number does not exist."})
    if (dist) {
        const distStatus = dist.status
        if (distStatus !== 'ACTIVE') return res.json({status: 1, reason: "DISTRIBUTOR number is not ACTIVE"})
    }
    try {
        let retailorId = `RETAIL-${contactId}`
        let pin = generatePIN()
        await dist.createRetailor({
            contactId,
            firstName,
            lastName,
            businessName,
            retailorId,
            pin,
            margin
        })
        res.json({
            status: "0",
            reason: "success"
        })
    } catch (ex) {
        console.log(ex)
        let {type, path, value} = ex.errors[0]
        let errorMessage = "Distributor Creation Failed.System Failure.Please contact SysAdmin";
        if (type === 'unique violation') errorMessage = `${path}, ${value} already exist.`
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

    let {oldPIN, newPIN, acctId, channel} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    let contactId = `233${acctId.substring(1)}`

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

    let {oldPIN, newPIN, acctId, channel} = req.body

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    let contactId = `233${acctId.substring(1)}`

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

    let {acctId, pin, channel} = req.query

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    let contactId = `233${acctId.substring(1)}`
    try {
        const dist = await Distributor.findOne({where: {contactId}})
        if (!dist) return res.json({status: 1, reason: "DISTRIBUTOR number does not exist."})
        if (dist) {
            if (dist.pin !== pin) res.json({status: 1, reason: 'Incorrect PIN provided. Please check and try again'})
            let cashValue = dist.cashValue;
            cashValue = parseFloat(cashValue / 100).toFixed(2)
            res.json({
                status: 0,
                reason: "success",
                balance: cashValue
            })

        }
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

    let {acctId, pin, channel} = req.query

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    let contactId = `233${acctId.substring(1)}`
    try {
        const retail = await Retailor.findOne({where: {contactId}})
        if (!retail) return res.json({status: 1, reason: "RETAILOR number does not exist."})
        if (retail) {
            if (retail.pin !== pin) res.json({status: 1, reason: 'Incorrect PIN provided. Please check and try again'})
            let cashValue = retail.cashValue;
            cashValue = parseFloat(cashValue / 100).toFixed(2)
            res.json({
                status: 0,
                reason: "success",
                balance: cashValue
            })

        }
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

    let {acctId, pin, channel, msisdn, amount} = req.body
    amount *= 100;

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    let contactId = `233${acctId.substring(1)}`
    try {
        const retail = await Retailor.findOne({where: {contactId}})
        if (!retail) return res.json({status: 1, reason: "RETAILOR number does not exist."})
        if (retail) {
            if (pin !== retail.pin) return res.json({
                status: 1,
                reason: " Incorrect PIN provided. Please check and try again"
            })
            if (amount > retail.cashValue) return res.json({
                status: 1,
                reason: `Insufficient FUNDS in accounts. Your balance is GHC${parseFloat(retail.cashValue / 100).toFixed(2)}`
            })


            let transaction;
            try {

                transaction = await sequelize.transaction({isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED})
                let retailor = await Retailor.findOne({where: {contactId}}, {
                    transaction
                })
                if (amount > retailor.cashValue) {
                    return res.json({
                        status: 1,
                        reason: `Insufficient FUNDS in accounts. Your balance is GHC${parseFloat(retailor.cashValue / 100).toFixed(2)}`
                    })
                }

                if (sessions[contactId]) return res.json({status: 1, reason: "System Busy. Please try again later"})
                else {
                    sessions[contactId] = true
                    retailor.cashValue -= amount;
                    await retailor.save({transaction})

                    const result = await creditCashIN(msisdn, "12345", acctId, amount, channel)
                    await transaction.commit();
                    delete sessions[contactId]
                    res.json({status: 0, reason: 'success'})
                }


            } catch (ex) {
                delete sessions[acctId]
                console.log(ex)
                await transaction.rollback()
                res.json({status: 1, reason: 'System failure. Please try again'})

            } finally {
                delete sessions[acctId]
            }


        }
    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "System Error. Please contact sysAdmin"
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
    amount *= 100;

    if (channel.toLowerCase() !== req.user.channel.toLowerCase()) {
        return res.json({
            status: 2,
            reason: `Invalid Request channel ${channel}`
        })
    }
    let contactId = `233${acctId.substring(1)}`
    retailorId = `233${acctId.substring(1)}`

    try {

        const dist = await Distributor.findOne({where: {contactId}})
        if (!dist) return res.json({status: 1, reason: "DISTRIBUTOR number does not exist."})
        if (dist.pin !== pin) return res.json({status: 1, reason: "Incorrect PIN provided. Please check and try again"})
        if (dist.status !== 'ACTIVE') return res.json({
            status: 1,
            reason: "Distributor account is not ACTIVE. Please make sure you activate account"
        })
        let transaction;
        try {

            transaction = await sequelize.transaction({isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED})
            let distributor = await Distributor.findOne({where: {contactId}}, {transaction})
            if (amount > distributor.cashValue) {
                return res.json({
                    status: 1,
                    reason: `Insufficient FUNDS in accounts. Your balance is GHC${parseFloat(distributor.cashValue / 100).toFixed(2)}`
                })
            }



            if (sessions[contactId]) return res.json({status: 1, reason: "System Busy. Please try again"})
            else {
                sessions[acctId] = true
                //distributor.cashValue -= amount;
                console.log(JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(distributor))))

                //await distributor.save({transaction})
                //await transaction.commit();
                delete sessions[contactId]
                res.json({status: 0, reason: 'success'})
            }


        } catch (ex) {
            delete sessions[acctId]
            console.log(ex)
            await transaction.rollback()
            res.json({status: 1, reason: 'System failure. Please try again'})

        } finally {
            delete sessions[acctId]
        }


    } catch (ex) {
        console.log(ex)
        res.json({
            status: 1,
            reason: "System Error. Please contact sysAdmin"
        })

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

async function getContact(msisdn) {

    try {
        const url = "http://172.25.39.16:2222";
        const sampleHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'http://SCLINSMSVM01P/wsdls/Surfline/MGMGetReferralAcctInfo/MGMGetReferralAcctInfo',
            'Authorization': 'Basic YWlhb3NkMDE6YWlhb3NkMDE='
        };

        let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:mgm="http://SCLINSMSVM01P/wsdls/Surfline/MGMGetReferralAcctInfo.wsdl">
   <soapenv:Header/>
   <soapenv:Body>
      <mgm:MGMGetReferralAcctInfoRequest>
         <CC_Calling_Party_Id>${msisdn}</CC_Calling_Party_Id>
      </mgm:MGMGetReferralAcctInfoRequest>
   </soapenv:Body>
</soapenv:Envelope>`;


        const {response} = await soapRequest({url: url, headers: sampleHeaders, xml: xmlBody, timeout: 5000});
        const {body} = response;
        let jsonObj = parser.parse(body, options);
        let jsonResult = jsonObj.Envelope.Body;
        let result = {}
        if (jsonResult.MGMGetReferralAcctInfoResult && jsonResult.MGMGetReferralAcctInfoResult.Result) {
            result.contact = jsonResult.MGMGetReferralAcctInfoResult.Result
            result.success = true;


        } else {
            result.contact = null;
            result.success = false;

        }
        return result;

    } catch (error) {
        console.log(error.toString())
        return {
            contact: null,
            success: false,
        }

    }

}

async function checkExisting(contactId) {
    const dist = await Distributor.findOne({where: {contactId}})
    if (dist) return `${contactId} is already registered as DISTRIBUTOR. Please use a different number`;
    const retail = await Retailor.findOne({where: {contactId}})
    if (retail) return `${contactId} is already registered as RETAILOR. Please use a different number`;
    return null;

}

async function creditCashIN(msisdn, txnId, acctId, amount, channel) {
    const url = process.env.OSD_ENDPOINT;

    const headers = {
        'User-Agent': 'NodeApp',
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'http://172.25.39.13/wsdls/Surfline/CustomRecharge/CustomRecharge',
        'Authorization': `Basic ${process.env.OSD_AUTH}`
    };


    const creditXML = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ret="http://SCLINSMSVM01P/wsdls/Surfline/RetailorCashCredit.wsdl">
   <soapenv:Header/>
   <soapenv:Body>
      <ret:RetailorCashCreditRequest>
         <CC_Calling_Party_Id>${msisdn}</CC_Calling_Party_Id>
         <Recharge_List_List>
            <Recharge_List>
               <Balance_Type_Name>General Cash</Balance_Type_Name>
               <Recharge_Amount>${amount}</Recharge_Amount>
               <Balance_Expiry_Extension_Period></Balance_Expiry_Extension_Period>
               <Balance_Expiry_Extension_Policy></Balance_Expiry_Extension_Policy>
               <Bucket_Creation_Policy></Bucket_Creation_Policy>
               <Balance_Expiry_Extension_Type></Balance_Expiry_Extension_Type>
            </Recharge_List>
         </Recharge_List_List>
         <CHANNEL>${channel}</CHANNEL>
         <TRANSACTION_ID>${txnId}</TRANSACTION_ID>
         <POS_USER>${acctId}</POS_USER>
      </ret:RetailorCashCreditRequest>
   </soapenv:Body>
</soapenv:Envelope>`;

    const {response} = await soapRequest({
        url: url,
        headers: headers,
        xml: creditXML,
        timeout: 7000
    });
    const {body} = response;
    let jsonObj = parser.parse(body, options);
    const soapResponseBody = jsonObj.Envelope.Body;
    if (soapResponseBody.RetailorCashCreditResult) {
        const {OCNCC_REFID, Result} = soapResponseBody.RetailorCashCreditResult
        if (OCNCC_REFID) {
            return {
                status: 'success',
                contact: Result ? Result : null,
                txnId_IN: OCNCC_REFID
            }
        } else {
            throw new Error("Error in crediting subscriber account")
        }

    }


}


function generatePIN() {
    const STRING = "0123456789";
    const length = STRING.length;
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += STRING.charAt(Math.floor(Math.random() * length))
    }

    return code;

}


module.exports = router;

