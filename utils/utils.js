module.exports = {

    getTransactionObj: (transactionType, contactId, details) => {

        if (transactionType === "retail-create") {
            const {firstName, lastName, businessName, retailorId, acctId} = details
            return {
                transactionType,
                contactId,
                details: `firstName=${firstName},lastName=${lastName},retailorId=${retailorId},businessName=${businessName},acctId=${acctId},contactId=${contactId},result=success`
            }
        }
        else if (transactionType === "pin-change") {
            return {
                transactionType,
                contactId,
                details: "result=success"
            }

        }
        else if (transactionType === "pin-reset") {
            return {
                transactionType,
                contactId,
                details: "result=success"
            }

        }
        else if (transactionType === 'dist-credit') {
            const {distributorId, amount} = details
            return {
                transactionType,
                contactId,
                details: `$distributorId=${distributorId},amount=${amount},result=success`
            }


        }
        else if (transactionType === 'cash-credit') {
            const {distributorId, amount} = details
            return {
                transactionType,
                contactId,
                details: `distributorId=${distributorId},amount=${amount},result=success`
            }


        }
        else if (transactionType === 'dist-debit') {
            const {retailorId, amount} = details
            return {
                transactionType,
                contactId,
                details: `retailorId=${retailorId},cost=${amount},result=success`
            }

        }
        else if (transactionType === 'cash-debit') {
            const {subscriberId, amount} = details
            return {
                transactionType,
                contactId,
                details: `subscriberId=${subscriberId},cost=${amount},result=success`
            }


        }
        else if (transactionType === 'bundle-debit') {
            const {subscriberId, amount, bundleName} = details
            return {
                transactionType,
                contactId,
                details: `subscriberId=${subscriberId},cost=${amount},bundleName=${bundleName},result=success`
            }


        }
    },

    getTransactionId: () => {

        const STRING = "0123456789";
        const length = STRING.length;
        let code = "";
        for (let i = 0; i < 11; i++) {
            code += STRING.charAt(Math.floor(Math.random() * length))
        }

        return code;

    }
}
