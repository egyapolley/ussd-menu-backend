// noinspection BadExpressionStatementJS

const Joi = require("joi");

module.exports = {

    createDistributor: (body) => {

        const schema = Joi.object({
            businessName: Joi.string()
                .trim()
                .lowercase()
                .required()
                .label('BUSINESS NAME')
                .max(255)
                .min(2),
            contactId: Joi.string()
                .trim()
                .regex(/^233[1234567890]{9}$/)
                .length(12)
                .required()
                .messages({"string.pattern.base": "Invalid Contact Number length. Contact should be 12 digits starting with 233"}),
            areaZone: Joi.string()
                .trim()
                .lowercase()
                .required()
                .max(255)
                .label('TERRITORY/AREA')
                .min(4),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)
    },
    createRetailor: (body) => {

        const schema = Joi.object({
            businessName: Joi.string()
                .trim()
                .lowercase()
                .label('BUSINESS NAME')
                .max(255)
                .min(2),
            firstName: Joi.string()
                .trim()
                .lowercase()
                .required()
                .label('FIRST NAME')
                .max(255)
                .min(4),
            lastName: Joi.string()
                .trim()
                .lowercase()
                .required()
                .label('LAST NAME')
                .max(255)
                .min(4),
            pin: Joi.string()
                .length(6)
                .trim()
                .regex(/^[0123456789]{6}$/)
                .required()
                .label('PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),
            distributorId: Joi.number()
                .required()
                .label('DISTRIBUTOR'),
            contactId: Joi.string()
                .trim()
                .regex(/^233[1234567890]{9}$/)
                .required()
                .length(12)
                .messages({"string.pattern.base": "Invalid Contact Number length. Contact should be 12 digits starting with 0"}),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)
    },

    activatePIN: (body) => {

        const schema = Joi.object({
            oldPIN: Joi.string()
                .length(6)
                .regex(/^[0123456789]{6}$/)
                .required()
                .trim()
                .label('OLD PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),

            newPIN: Joi.string()
                .length(6)
                .required()
                .trim()
                .regex(/^[0123456789]{6}$/)
                .label('NEW PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),
            acctId: Joi.number()
                .required()
                .label('PHONE NUMBER'),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)
    },

    getBalance: (body) =>{
        const schema = Joi.object({
            pin: Joi.string()
                .length(6)
                .regex(/^[0123456789]{6}$/)
                .required()
                .label('PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),
            acctId: Joi.number()
                .required()
                .label('PHONE NUMBER'),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)

    },


    cashTopSub:(body) =>{
        const schema = Joi.object({
            pin: Joi.string()
                .length(6)
                .regex(/^[0123456789]{6}$/)
                .required()
                .label('PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),
            acctId: Joi.number()
                .required()
                .label('PHONE NUMBER'),
            amount: Joi.number()
                .required()
                .max(1000)
                .min(0.01)
                .label('AMOUNT'),
            surfContact: Joi.string()
                .required(),
            msisdn: Joi.string()
                .trim()
                .regex(/^23325[1234567890]{7}$/)
                .required()
                .length(12)
                .messages({"string.pattern.base": "Invalid Surfline Number. Surfline number should start with 025"}),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)

    },
    dataTopSub:(body) =>{
        const schema = Joi.object({
            pin: Joi.string()
                .length(6)
                .regex(/^[0123456789]{6}$/)
                .required()
                .label('PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),
            acctId: Joi.number()
                .required()
                .label('PHONE NUMBER'),
            bundleId: Joi.string()
                .required(),
            msisdn: Joi.string()
                .trim()
                .regex(/^23325[1234567890]{7}$/)
                .required()
                .length(12)
                .messages({"string.pattern.base": "Invalid Surfline Number. Surfline number should start with 025"}),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)

    },
    cashTopRetail:(body) =>{
        const schema = Joi.object({
            pin: Joi.string()
                .length(6)
                .regex(/^[0123456789]{6}$/)
                .required()
                .label('PIN')
                .messages({"string.pattern.base": "Invalid PIN length. PIN should be 6 digits"}),
            acctId: Joi.number()
                .required()
                .label('DISTRIBUTOR ID'),
            amount: Joi.number()
                .required()
                .max(1000)
                .min(0.01)
                .label('AMOUNT'),
            retailorId: Joi.number()
                .required()
                .label("RETAILOR ID"),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(4)
        });

        return schema.validate(body)

    },


}

