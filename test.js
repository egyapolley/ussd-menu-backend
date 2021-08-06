const soapRequest = require("easy-soap-request");
const parser = require("fast-xml-parser");
const he = require("he");

require("dotenv").config();

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

async  function creditCashIN(msisdn, txnId,acctId, amount,channel) {
    msisdn = `233${msisdn}`
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
            timeout: 4000
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
                return null
            }

        }


}

creditCashIN('255000102',"TEST1234",'0249131117',100,'*718*77#')
.then(result =>{
    if (result)
    {
        console.log(result)
    }else {
        console.log("error")
    }

}).catch(reason => {
    console.log(reason)
})
