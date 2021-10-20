const Joi = require("joi");
module.exports = {
    checkContactId: (body) =>{
        const schema = Joi.object({
            contactId: Joi.number()
                .required()
                .label('Contact'),
            user: Joi.string()
                .trim()
                .required(),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
                .min(2)
        });

        return schema.validate(body)

    },
    createDistributor: (body) => {

        const schema = Joi.object({
            businessName: Joi.string()
                .trim()
                .lowercase()
                .required()
                .label('BUSINESS NAME')
                .max(255)
                .min(1),
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
                .min(1),
            user: Joi.string()
                .trim()
                .required(),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
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
                .min(1),
            firstName: Joi.string()
                .trim()
                .lowercase()
                .required()
                .label('FIRST NAME')
                .max(255)
                .min(1),
            lastName: Joi.string()
                .trim()
                .lowercase()
                .required()
                .label('LAST NAME')
                .max(255)
                .min(1),
            user: Joi.string()
                .trim()
                .required(),
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
        });

        return schema.validate(body)
    },
    cashTopDist:(body) =>{
        const schema = Joi.object({
            acctId: Joi.number()
                .required()
                .label('DISTRIBUTOR ID'),
            amount: Joi.number()
                .required()
                .max(1000)
                .min(0.01)
                .label('AMOUNT'),
            user: Joi.string()
                .trim()
                .required(),
            channel: Joi.string()
                .trim()
                .alphanum()
                .required()
        });

        return schema.validate(body)

    },

}
